import {
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
  UNAUTHORIZED: 'Activate the extension again to create tracking.',
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
