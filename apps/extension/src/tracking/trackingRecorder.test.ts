import { afterEach, expect, it, vi } from 'vitest';
import { createTrackingRecorder } from './trackingRecorder.js';
const request = { recipient: 'test@example.com', subject: 'Test' };
const tracking = {
  trackingId: crypto.randomUUID(),
  trackingUrl: 'https://example.com/o/test',
  createdAt: '2026-09-25T10:00:00.000Z',
};
afterEach(() => vi.useRealTimers());
it('waits for metadata storage before returning success, without saving URL/body/token', async () => {
  const order: string[] = [];
  const create = vi.fn(async () => {
    order.push('create');
    return tracking;
  });
  const add = vi.fn(async () => {
    order.push('save');
  });
  expect(await createTrackingRecorder(create, add)(request)).toEqual(tracking);
  order.push('return');
  expect(order).toEqual(['create', 'save', 'return']);
  expect(add).toHaveBeenCalledExactlyOnceWith({
    ...request,
    trackingId: tracking.trackingId,
    createdAt: tracking.createdAt,
  });
});
it('does not store failed tracking creation', async () => {
  const add = vi.fn();
  await expect(
    createTrackingRecorder(
      vi.fn().mockRejectedValue(new Error()),
      add,
    )(request),
  ).rejects.toThrow();
  expect(add).not.toHaveBeenCalled();
});
it('returns tracking and a safe warning when storage rejects', async () => {
  const warn = vi.fn();
  expect(
    await createTrackingRecorder(
      vi.fn().mockResolvedValue(tracking),
      vi.fn().mockRejectedValue(new Error('sensitive')),
      warn,
    )(request),
  ).toEqual(tracking);
  expect(warn).toHaveBeenCalledExactlyOnceWith();
});
it('bounds stalled storage and does not retry creation', async () => {
  vi.useFakeTimers();
  const create = vi.fn().mockResolvedValue(tracking);
  const warn = vi.fn();
  const result = createTrackingRecorder(
    create,
    () => new Promise(() => {}),
    warn,
  )(request);
  await vi.advanceTimersByTimeAsync(1500);
  expect(await result).toEqual(tracking);
  expect(create).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledOnce();
});
