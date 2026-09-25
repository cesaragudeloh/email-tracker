import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  OpenTrackingError,
  logOpen,
  type OpenLogEntry,
  type OpenMetadata,
  type TrackingOpenEvent,
} from './openTracking.js';
import type { TrackingRepository } from './trackingRepository.js';

const trackingIdSchema = z.uuid();

export class OpenTrackingService {
  constructor(
    private readonly repository: Pick<
      TrackingRepository,
      'getTracking' | 'createOpenEvent'
    >,
    private readonly log: (entry: OpenLogEntry) => void = logOpen,
  ) {}

  async open(
    trackingId: unknown,
    metadata: OpenMetadata,
    requestId: string,
  ): Promise<void> {
    const parsed = trackingIdSchema.safeParse(trackingId);
    if (!parsed.success)
      throw new OpenTrackingError('INVALID_TRACKING_ID', 400);
    // UUID text is case-insensitive; generated EMAIL keys use lowercase.
    const id = parsed.data.toLowerCase();
    // Read failures must propagate: existence has not been established.
    const tracking = await this.repository.getTracking(id);
    if (!tracking) throw new OpenTrackingError('NOT_FOUND', 404);
    const event: TrackingOpenEvent = {
      trackingId: id,
      eventId: randomUUID(),
      eventType: 'OPEN',
      openedAt: new Date().toISOString(),
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    };
    let persistenceSuccess = true;
    try {
      await this.repository.createOpenEvent(event);
    } catch {
      // A known EMAIL gets a pixel even if this particular OPEN is lost.
      persistenceSuccess = false;
    }
    this.log({
      requestId,
      trackingId: id,
      eventId: event.eventId,
      eventType: 'OPEN',
      persistenceSuccess,
      ...(!persistenceSuccess ? { errorCategory: 'OPEN_WRITE_FAILED' } : {}),
    });
  }
}
