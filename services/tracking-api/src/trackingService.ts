import { randomUUID } from 'node:crypto';
import {
  createTrackingRequestSchema,
  type CreateTrackingResponse,
} from '@email-tracker/shared';
import { TrackingError, type AuthenticatedIdentity } from './tracking.js';
import type { TrackingRepository } from './trackingRepository.js';

export class TrackingService {
  constructor(
    private readonly repository: Pick<TrackingRepository, 'create'>,
    private readonly trackingBaseUrl: string,
  ) {}

  async create(
    identity: AuthenticatedIdentity,
    input: unknown,
  ): Promise<CreateTrackingResponse> {
    const parsed = createTrackingRequestSchema.safeParse(input);
    if (!parsed.success) throw new TrackingError('INVALID_REQUEST', 400);
    const trackingId = randomUUID();
    const createdAt = new Date().toISOString();
    const trackingUrl = `${this.trackingBaseUrl}/o/${trackingId}`;
    await this.repository.create({
      ...parsed.data,
      licenseId: identity.licenseId,
      installationId: identity.installationId,
      trackingId,
      createdAt,
      status: 'CREATED',
    });
    return { trackingId, trackingUrl, createdAt };
  }
}
