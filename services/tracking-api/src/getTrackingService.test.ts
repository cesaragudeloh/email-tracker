import { expect, it, vi } from 'vitest';
import { GetTrackingService } from './getTrackingService.js';
const identity = {
  licenseId: 'lic_owner',
  installationId: crypto.randomUUID(),
};
const record = {
  trackingId: crypto.randomUUID(),
  licenseId: identity.licenseId,
  installationId: crypto.randomUUID(),
  recipient: 'client@example.com',
  subject: 'Private subject',
  createdAt: '2026-09-24T10:00:00.000Z',
  status: 'CREATED' as const,
};
const events = [1, 2, 3].map((hour) => ({
  eventId: crypto.randomUUID(),
  openedAt: `2026-09-24T1${hour}:00:00.000Z`,
  ip: '192.0.2.1',
  userAgent: 'Raw agent',
}));
function setup() {
  const repository = {
    getTracking: vi.fn().mockResolvedValue(record),
    listOpenEvents: vi.fn().mockResolvedValue(events),
  };
  return { repository, service: new GetTrackingService(repository) };
}
it.each([0, 1, 3])(
  'derives all fields from %s OPEN events for another device of the same license',
  async (count) => {
    const { service, repository } = setup();
    repository.listOpenEvents.mockResolvedValue(events.slice(0, count));
    expect(await service.get(identity, record.trackingId)).toEqual({
      trackingId: record.trackingId,
      recipient: record.recipient,
      subject: record.subject,
      createdAt: record.createdAt,
      status: count ? 'OPEN_DETECTED' : 'CREATED',
      openCount: count,
      firstOpenedAt: count ? events[0].openedAt : null,
      lastOpenedAt: count ? events[count - 1].openedAt : null,
      events: events.slice(0, count),
    });
    expect(repository.getTracking).toHaveBeenCalledWith(record.trackingId);
    expect(repository.listOpenEvents).toHaveBeenCalledWith(record.trackingId);
  },
);
it.each([undefined, { ...record, licenseId: 'another-license' }])(
  'denies absent or foreign EMAIL before querying events',
  async (email) => {
    const { service, repository } = setup();
    repository.getTracking.mockResolvedValue(email);
    await expect(
      service.get(identity, record.trackingId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    expect(repository.listOpenEvents).not.toHaveBeenCalled();
  },
);
it.each(['getTracking', 'listOpenEvents'] as const)(
  'propagates %s failures',
  async (method) => {
    const { service, repository } = setup();
    repository[method].mockRejectedValue(new Error('private failure'));
    await expect(service.get(identity, record.trackingId)).rejects.toThrow(
      'private failure',
    );
  },
);
