import type { CreateTracking } from '../api/trackingMessages.js';
import type { LocalTrackingRecord } from './historyStorage.js';

// History is optional. Bound its latency within Gmail's existing 20s deadline.
export function createTrackingRecorder(
  create: CreateTracking,
  add: (record: LocalTrackingRecord) => Promise<void>,
  warn: () => void = () =>
    console.warn('Email Tracker: local history unavailable'),
): CreateTracking {
  return async (request) => {
    const tracking = await create(request);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() =>
          add({
            trackingId: tracking.trackingId,
            recipient: request.recipient,
            subject: request.subject,
            createdAt: tracking.createdAt,
          }),
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('History timeout')), 1500);
        }),
      ]);
    } catch {
      warn();
    } finally {
      clearTimeout(timer);
    }
    return tracking;
  };
}
