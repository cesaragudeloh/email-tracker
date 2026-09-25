import { z } from 'zod';
import {
  getTrackingResponseSchema,
  type GetTrackingResponse,
  createTrackingRequestSchema,
  createTrackingResponseSchema,
  type CreateTrackingRequest,
  type CreateTrackingResponse,
} from '@email-tracker/shared';
import {
  createActivationStorage,
  type ActivationStorage,
} from '../activation/storage.js';
import { config } from '../config.js';

const messages = {
  UNAUTHORIZED: 'Activate the extension again to access tracking.',
  NOT_FOUND: 'Tracking not found.',
  INVALID_TRACKING_ID: 'Enter a valid tracking ID.',
  INVALID_REQUEST:
    'Enter a valid recipient and a subject of at most 998 characters.',
  SERVICE_UNAVAILABLE: 'Tracking service unavailable. Please try again later.',
};
export class TrackingClientError extends Error {
  constructor(public readonly code: keyof typeof messages) {
    super(messages[code]);
  }
}

// Invoke only from a trusted extension context (popup or service worker).
export function createTrackingClient(
  storage: Pick<
    ActivationStorage,
    'getInstallationId' | 'readAuthorization'
  > = createActivationStorage(),
  baseUrl = config.apiBaseUrl,
  fetcher: typeof fetch = fetch,
) {
  return {
    async getTracking(trackingId: string): Promise<GetTrackingResponse> {
      try {
        const installationId = await storage.getInstallationId();
        const authorization = await storage.readAuthorization(installationId);
        if (!authorization) throw new TrackingClientError('UNAUTHORIZED');
        const parsed = z.uuid().safeParse(trackingId);
        if (!parsed.success)
          throw new TrackingClientError('INVALID_TRACKING_ID');
        if (!baseUrl) throw new TrackingClientError('SERVICE_UNAVAILABLE');
        const response = await fetcher(
          `${baseUrl}/api/tracking/${parsed.data}`,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${authorization.accessToken}` },
            signal: AbortSignal.timeout(15000),
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
          },
        );
        if (response.status === 401)
          throw new TrackingClientError('UNAUTHORIZED');
        if (response.status === 404) throw new TrackingClientError('NOT_FOUND');
        if (response.status === 400)
          throw new TrackingClientError('INVALID_TRACKING_ID');
        if (!response.ok) throw new TrackingClientError('SERVICE_UNAVAILABLE');
        return getTrackingResponseSchema.parse(await response.json());
      } catch (error) {
        if (error instanceof TrackingClientError) throw error;
        throw new TrackingClientError('SERVICE_UNAVAILABLE');
      }
    },
    async createTracking(
      request: CreateTrackingRequest,
    ): Promise<CreateTrackingResponse> {
      try {
        const installationId = await storage.getInstallationId();
        const authorization = await storage.readAuthorization(installationId);
        if (!authorization) throw new TrackingClientError('UNAUTHORIZED');
        const parsed = createTrackingRequestSchema.safeParse(request);
        if (!parsed.success) throw new TrackingClientError('INVALID_REQUEST');
        if (!baseUrl) throw new TrackingClientError('SERVICE_UNAVAILABLE');
        const response = await fetcher(`${baseUrl}/api/tracking`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${authorization.accessToken}`,
          },
          body: JSON.stringify(parsed.data),
          signal: AbortSignal.timeout(15000),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
        });
        if (response.status === 401)
          throw new TrackingClientError('UNAUTHORIZED');
        if (response.status === 400)
          throw new TrackingClientError('INVALID_REQUEST');
        if (!response.ok) throw new TrackingClientError('SERVICE_UNAVAILABLE');
        return createTrackingResponseSchema.parse(await response.json());
      } catch (error) {
        if (error instanceof TrackingClientError) throw error;
        throw new TrackingClientError('SERVICE_UNAVAILABLE');
      }
    },
  };
}
