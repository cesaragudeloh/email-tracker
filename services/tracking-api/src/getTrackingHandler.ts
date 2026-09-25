import { z } from 'zod';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import type { GetTrackingResponse } from '@email-tracker/shared';
import { TrackingError, type AuthenticatedIdentity } from './tracking.js';

interface LogEntry {
  requestId: string;
  result: string;
  trackingId?: string;
}

export function createGetTrackingHandler(
  authorize: (header: string | undefined) => Promise<AuthenticatedIdentity>,
  get: (
    identity: AuthenticatedIdentity,
    trackingId: string,
  ) => Promise<GetTrackingResponse>,
  log: (entry: LogEntry) => void = (entry) =>
    console.info(JSON.stringify(entry)),
) {
  return async (
    event: APIGatewayProxyEventV2,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = event.requestContext.requestId;
    const respond = (statusCode: number, body: unknown) => ({
      statusCode,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
      body: JSON.stringify(body),
    });
    try {
      const header = Object.entries(event.headers ?? {}).find(
        ([name]) => name.toLowerCase() === 'authorization',
      )?.[1];
      const parsed = z.uuid().safeParse(event.pathParameters?.trackingId);
      if (!parsed.success) throw new TrackingError('INVALID_TRACKING_ID', 400);
      const identity = await authorize(header);
      const result = await get(identity, parsed.data.toLowerCase());
      log({ requestId, trackingId: result.trackingId, result: result.status });
      return respond(200, result);
    } catch (error) {
      const code =
        error instanceof TrackingError ? error.code : 'SERVICE_UNAVAILABLE';
      log({ requestId, result: code });
      return respond(error instanceof TrackingError ? error.statusCode : 500, {
        error: code,
      });
    }
  };
}
