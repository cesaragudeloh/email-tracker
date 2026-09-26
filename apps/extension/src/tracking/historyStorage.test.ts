import { beforeEach, expect, it, vi } from 'vitest';
import { createTrackingHistoryStorage } from './historyStorage.js';
const installationId = crypto.randomUUID();
const record = {
  trackingId: crypto.randomUUID(),
  recipient: 'test@example.com',
  subject: 'Subject',
  createdAt: '2026-09-25T10:00:00.000Z',
};
let values: Record<string, unknown>;
let queue: Promise<unknown>;
const area = {
  get: vi.fn(async (key: string) => ({ [key]: values[key] })),
  set: vi.fn(async (data: Record<string, unknown>) => {
    Object.assign(values, data);
  }),
  setAccessLevel: vi.fn(async () => {}),
};
const locks = {
  request: (_name: string, callback: () => Promise<unknown>) => {
    const next = queue.then(callback);
    queue = next.catch(() => {});
    return next;
  },
};
const create = () =>
  createTrackingHistoryStorage(
    async () => installationId,
    area as unknown as chrome.storage.LocalStorageArea,
    locks as unknown as LockManager,
  );
beforeEach(() => {
  values = {};
  queue = Promise.resolve();
  vi.clearAllMocks();
});
it('adds, lists and retrieves only minimal metadata with trusted access', async () => {
  const storage = create();
  await storage.addTrackedEmail(record);
  expect(await storage.listTrackedEmails()).toEqual([record]);
  expect(await storage.getTrackedEmail(record.trackingId)).toEqual(record);
  expect(await storage.getTrackedEmail(crypto.randomUUID())).toBeUndefined();
  expect(values.trackingHistory).toEqual({ installationId, records: [record] });
  expect(area.setAccessLevel).toHaveBeenCalledWith({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
});
it('deduplicates by ID', async () => {
  await create().addTrackedEmail(record);
  await create().addTrackedEmail(record);
  expect(await create().listTrackedEmails()).toEqual([record]);
});
it('keeps the newest 100, ordered by timestamp rather than insertion', async () => {
  const records = Array.from({ length: 101 }, (_, i) => ({
    ...record,
    trackingId: crypto.randomUUID(),
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  }));
  values.trackingHistory = {
    installationId,
    records: records.slice(1).reverse(),
  };
  await create().addTrackedEmail(records[0]);
  expect(await create().listTrackedEmails()).toEqual(
    records.slice(1).reverse(),
  );
});
it.each([
  undefined,
  null,
  'bad',
  {},
  { installationId, records: 'bad' },
  { installationId: crypto.randomUUID(), records: [record] },
])(
  'tolerates empty/corrupt/foreign installation storage %j',
  async (stored) => {
    values.trackingHistory = stored;
    expect(await create().listTrackedEmails()).toEqual([]);
  },
);
it('filters corrupt entries and entries with private fields', async () => {
  values.trackingHistory = {
    installationId,
    records: [
      null,
      {},
      { ...record, trackingId: 'bad' },
      { ...record, body: 'private' },
      record,
      record,
    ],
  };
  expect(await create().listTrackedEmails()).toEqual([record]);
});
it('rejects invalid writes before storing anything', async () => {
  await expect(
    create().addTrackedEmail({ ...record, recipient: 'bad' }),
  ).rejects.toThrow();
  expect(area.set).not.toHaveBeenCalled();
});
it('serializes additions across storage instances to avoid lost records', async () => {
  const second = { ...record, trackingId: crypto.randomUUID() };
  await Promise.all([
    create().addTrackedEmail(record),
    create().addTrackedEmail(second),
  ]);
  expect(await create().listTrackedEmails()).toHaveLength(2);
});
it('propagates storage failure for the recorder to handle, and recovers', async () => {
  area.set.mockRejectedValueOnce(new Error('quota'));
  await expect(create().addTrackedEmail(record)).rejects.toThrow('quota');
  await create().addTrackedEmail(record);
  expect(await create().listTrackedEmails()).toEqual([record]);
});
