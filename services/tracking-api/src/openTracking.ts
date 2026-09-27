import type { OpenEnrichment } from '@email-tracker/shared';
export interface OpenMetadata {
  ip: string | null;
  userAgent: string | null;
}

export interface TrackingOpenEvent
  extends OpenMetadata, Partial<OpenEnrichment> {
  eventId: string;
  trackingId: string;
  eventType: 'OPEN';
  openedAt: string;
}

export class OpenTrackingError extends Error {
  constructor(
    public readonly code: 'INVALID_TRACKING_ID' | 'NOT_FOUND',
    public readonly statusCode: 400 | 404,
  ) {
    super(code);
  }
}

export interface OpenLogEntry {
  requestId: string;
  trackingId?: string;
  eventId?: string;
  eventType?: 'OPEN';
  persistenceSuccess?: boolean;
  errorCategory?: string;
  level?: 'warning';
  geoEnrichmentSuccess?: boolean;
  userAgentParsingSuccess?: boolean;
}

export function logOpen(entry: OpenLogEntry): void {
  if (entry.level === 'warning') console.warn(JSON.stringify(entry));
  else if (entry.errorCategory) console.error(JSON.stringify(entry));
  else console.info(JSON.stringify(entry));
}
