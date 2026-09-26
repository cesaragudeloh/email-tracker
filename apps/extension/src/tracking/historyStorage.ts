import { z } from 'zod';
import { createTrackingRequestSchema } from '@email-tracker/shared';

export const localTrackingRecordSchema = createTrackingRequestSchema
  .extend({
    trackingId: z.uuid(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type LocalTrackingRecord = z.infer<typeof localTrackingRecordSchema>;
export const HISTORY_LIMIT = 100;
const key = 'trackingHistory';

export function createTrackingHistoryStorage(
  getInstallationId: () => Promise<string>,
  area = chrome.storage.local,
  locks = navigator.locks,
) {
  async function read(installationId: string): Promise<LocalTrackingRecord[]> {
    const stored: unknown = (await area.get(key))[key];
    if (
      !stored ||
      typeof stored !== 'object' ||
      !('installationId' in stored) ||
      stored.installationId !== installationId ||
      !('records' in stored) ||
      !Array.isArray(stored.records)
    )
      return [];
    const unique = new Map<string, LocalTrackingRecord>();
    for (const value of stored.records) {
      const parsed = localTrackingRecordSchema.safeParse(value);
      if (parsed.success) unique.set(parsed.data.trackingId, parsed.data);
    }
    return recent([...unique.values()]);
  }
  function recent(records: LocalTrackingRecord[]) {
    return records
      .sort(
        (a, b) =>
          Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
          a.trackingId.localeCompare(b.trackingId),
      )
      .slice(0, HISTORY_LIMIT);
  }
  async function listTrackedEmails() {
    await area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    return read(await getInstallationId());
  }
  return {
    listTrackedEmails,
    async getTrackedEmail(trackingId: string) {
      return (await listTrackedEmails()).find(
        (record) => record.trackingId === trackingId,
      );
    },
    async addTrackedEmail(record: LocalTrackingRecord): Promise<void> {
      const validated = localTrackingRecordSchema.parse(record);
      await area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      const installationId = await getInstallationId();
      await locks.request('email-tracker-history', async () => {
        const records = (await read(installationId)).filter(
          (item) => item.trackingId !== validated.trackingId,
        );
        await area.set({
          [key]: { installationId, records: recent([...records, validated]) },
        });
      });
    },
  };
}
