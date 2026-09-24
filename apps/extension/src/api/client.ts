import {
  activationErrorSchema,
  activationResponseSchema,
  type ActivationRequest,
  type ActivationErrorCode,
  type ActivationResponse,
} from '@email-tracker/shared';

export class ActivationClientError extends Error {
  constructor(public readonly code: ActivationErrorCode) {
    super(code);
  }
}

export function createApiClient(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
) {
  return {
    async activate(request: ActivationRequest): Promise<ActivationResponse> {
      if (!baseUrl) throw new ActivationClientError('SERVICE_UNAVAILABLE');
      try {
        const response = await fetcher(`${baseUrl}/api/activate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(15000),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          const error = activationErrorSchema.safeParse(
            typeof body === 'object' && body !== null && 'error' in body
              ? body.error
              : undefined,
          );
          throw new ActivationClientError(
            response.status < 500 && error.success
              ? error.data
              : 'SERVICE_UNAVAILABLE',
          );
        }
        const parsed = activationResponseSchema.safeParse(body);
        if (
          !parsed.success ||
          parsed.data.installationId !== request.installationId
        )
          throw new ActivationClientError('SERVICE_UNAVAILABLE');
        return parsed.data;
      } catch (error) {
        if (error instanceof ActivationClientError) throw error;
        throw new ActivationClientError('SERVICE_UNAVAILABLE');
      }
    },
  };
}
