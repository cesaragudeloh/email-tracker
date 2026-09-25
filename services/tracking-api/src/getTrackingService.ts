import type { GetTrackingResponse } from '@email-tracker/shared';
import { TrackingError, type AuthenticatedIdentity } from './tracking.js';
import type { TrackingRepository } from './trackingRepository.js';

export class GetTrackingService {
  constructor(
    private readonly repository: Pick<
      TrackingRepository,
      'getTracking' | 'listOpenEvents'
    >,
  ) {}

  async get(
    identity: AuthenticatedIdentity,
    trackingId: string,
  ): Promise<GetTrackingResponse> {
    const record = await this.repository.getTracking(trackingId);
    // Identical error prevents disclosure of another license's tracking.
    if (!record || record.licenseId !== identity.licenseId)
      throw new TrackingError('NOT_FOUND', 404);
    const events = await this.repository.listOpenEvents(trackingId);
    return {
      trackingId: record.trackingId,
      recipient: record.recipient,
      subject: record.subject,
      createdAt: record.createdAt,
      status: events.length ? 'OPEN_DETECTED' : 'CREATED',
      openCount: events.length,
      firstOpenedAt: events[0]?.openedAt ?? null,
      lastOpenedAt: events[events.length - 1]?.openedAt ?? null,
      events,
    };
  }
}
