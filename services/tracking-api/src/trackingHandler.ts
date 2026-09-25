import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import type { CreateTrackingResponse } from '@email-tracker/shared';
import { TrackingError, type AuthenticatedIdentity } from './tracking.js';

interface LogEntry {
  requestId: string;
  result: string;
  trackingId?: string;
}

export function createTrackingHandler(
  authorize: (header: string | undefined) => Promise<AuthenticatedIdentity>,
  create: (
    identity: AuthenticatedIdentity,
    input: unknown,
  ) => Promise<CreateTrackingResponse>,
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
      const identity = await authorize(header);
      if (!event.body || event.body.length > 16384)
        throw new TrackingError('INVALID_REQUEST', 400);
      let input: unknown;
      try {
        input = JSON.parse(
          event.isBase64Encoded
            ? Buffer.from(event.body, 'base64').toString('utf8')
            : event.body,
        );
      } catch {
        throw new TrackingError('INVALID_REQUEST', 400);
      }
      const result = await create(identity, input);
      log({ requestId, trackingId: result.trackingId, result: 'CREATED' });
      return respond(201, result);
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
