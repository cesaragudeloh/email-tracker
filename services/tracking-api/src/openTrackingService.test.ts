import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { OpenTrackingService } from './openTrackingService.js';
const id = '550e8400-e29b-41d4-a716-446655440000';
const metadata = { ip: '192.0.2.1', userAgent: 'RawAgent' };
function setup() {
  const repository = {
    getTracking: vi.fn().mockResolvedValue({ trackingId: id }),
    createOpenEvent: vi.fn().mockResolvedValue(undefined),
  };
  const log = vi.fn();
  return { repository, log, service: new OpenTrackingService(repository, log) };
}
afterEach(() => vi.useRealTimers());
it('creates an OPEN with server UUID, UTC timestamp and raw metadata after reading EMAIL', async () => {
  const { service, repository } = setup();
  await service.open(id, metadata, 'request');
  const event = repository.createOpenEvent.mock.calls[0][0];
  expect(z.uuid().parse(event.eventId)).toBe(event.eventId);
  expect(z.iso.datetime().parse(event.openedAt)).toBe(event.openedAt);
  expect(event).toEqual({
    trackingId: id,
    eventId: expect.any(String),
    eventType: 'OPEN',
    openedAt: expect.any(String),
    ...metadata,
  });
  expect(repository.getTracking).toHaveBeenCalledWith(id);
  expect(repository.getTracking.mock.invocationCallOrder[0]).toBeLessThan(
    repository.createOpenEvent.mock.invocationCallOrder[0],
  );
});
it.each([undefined, '', 'invalid', `TRACKING#${id}`, `${id}/EMAIL`, ` ${id}`])(
  'rejects invalid ID %s without repository access',
  async (value) => {
    const { service, repository } = setup();
    await expect(
      service.open(value, metadata, 'request'),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.getTracking).not.toHaveBeenCalled();
    expect(repository.createOpenEvent).not.toHaveBeenCalled();
  },
);
it('normalizes uppercase UUID text to the stored key', async () => {
  const { service, repository } = setup();
  await service.open(id.toUpperCase(), metadata, 'request');
  expect(repository.getTracking).toHaveBeenCalledWith(id);
});
it('never writes when EMAIL is absent', async () => {
  const { service, repository } = setup();
  repository.getTracking.mockResolvedValue(undefined);
  await expect(service.open(id, metadata, 'request')).rejects.toMatchObject({
    statusCode: 404,
  });
  expect(repository.createOpenEvent).not.toHaveBeenCalled();
});
it('propagates read failures without writing', async () => {
  const { service, repository } = setup();
  repository.getTracking.mockRejectedValue(new Error('read failed'));
  await expect(service.open(id, metadata, 'request')).rejects.toThrow(
    'read failed',
  );
  expect(repository.createOpenEvent).not.toHaveBeenCalled();
});
it('swallows only OPEN write failures and logs a safe failure category', async () => {
  const { service, repository, log } = setup();
  repository.createOpenEvent.mockRejectedValue(new Error('private AWS detail'));
  await expect(service.open(id, metadata, 'request')).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledWith({
    requestId: 'request',
    trackingId: id,
    eventId: expect.any(String),
    eventType: 'OPEN',
    persistenceSuccess: false,
    errorCategory: 'OPEN_WRITE_FAILED',
  });
  expect(JSON.stringify(log.mock.calls)).not.toContain('private AWS detail');
  expect(JSON.stringify(log.mock.calls)).not.toContain(metadata.ip);
  expect(JSON.stringify(log.mock.calls)).not.toContain(metadata.userAgent);
});
it('stores null metadata and logs successful persistence', async () => {
  const { service, repository, log } = setup();
  await service.open(id, { ip: null, userAgent: null }, 'request');
  expect(repository.createOpenEvent).toHaveBeenCalledWith(
    expect.objectContaining({ ip: null, userAgent: null }),
  );
  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({ persistenceSuccess: true }),
  );
});
it('records all five concurrent loads even in the same millisecond', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T21:15:22.123Z'));
  const { service, repository } = setup();
  await Promise.all(
    Array.from({ length: 5 }, () => service.open(id, metadata, 'request')),
  );
  const events = repository.createOpenEvent.mock.calls.map(([event]) => event);
  expect(events).toHaveLength(5);
  expect(new Set(events.map((event) => event.eventId)).size).toBe(5);
  expect(new Set(events.map((event) => event.openedAt))).toEqual(
    new Set(['2026-09-24T21:15:22.123Z']),
  );
});
