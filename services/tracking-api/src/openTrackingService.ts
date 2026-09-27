import { openEnrichmentSchema } from '@email-tracker/shared';
import type { GeoService } from './geoService.js';
import { UserAgentService } from './userAgentService.js';
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
    private readonly geo: GeoService = { locate: async () => null },
    private readonly userAgent: Pick<
      UserAgentService,
      'parse'
    > = new UserAgentService(),
  ) {}

  private async locate(ip: string) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.geo.locate(ip),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('GEO_TIMEOUT')), 1000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

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
    const enrichment = openEnrichmentSchema.parse({});
    try {
      const geo = metadata.ip ? await this.locate(metadata.ip) : null;
      Object.assign(enrichment, geo);
    } catch {
      this.log({
        requestId,
        trackingId: id,
        level: 'warning',
        geoEnrichmentSuccess: false,
        errorCategory: 'GEO_ENRICHMENT_FAILED',
      });
    }
    try {
      Object.assign(enrichment, this.userAgent.parse(metadata.userAgent ?? ''));
    } catch {
      this.log({
        requestId,
        trackingId: id,
        level: 'warning',
        userAgentParsingSuccess: false,
        errorCategory: 'UA_PARSING_FAILED',
      });
    }
    Object.assign(event, enrichment);
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
