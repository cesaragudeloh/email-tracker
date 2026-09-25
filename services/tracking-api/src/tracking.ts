import type {
  CreateTrackingRequest,
  TrackingStatus,
} from '@email-tracker/shared';

export interface AuthenticatedIdentity {
  licenseId: string;
  installationId: string;
}

export interface TrackingRecord
  extends CreateTrackingRequest, AuthenticatedIdentity {
  trackingId: string;
  createdAt: string;
  status: TrackingStatus;
}

export class TrackingError extends Error {
  constructor(
    public readonly code: 'INVALID_REQUEST' | 'UNAUTHORIZED',
    public readonly statusCode: 400 | 401,
  ) {
    super(code);
  }
}
