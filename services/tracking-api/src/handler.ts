import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  activationRequestSchema,
  type ActivationRequest,
  type ActivationResponse,
} from '@email-tracker/shared';
import { ActivationError } from './errors.js';

type Activate = (request: ActivationRequest) => Promise<ActivationResponse>;
interface LogEntry {
  requestId: string;
  result: string;
  installationId?: string;
  licenseId?: string;
}

export function createHandler(
  activate: Activate,
  log: (entry: LogEntry) => void = (entry) =>
    console.info(JSON.stringify(entry)),
) {
  return async (
    event: APIGatewayProxyEventV2,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    let request: ActivationRequest | undefined;
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
      if (!event.body || event.body.length > 4096)
        throw new ActivationError('INVALID_REQUEST', 400);
      let body: unknown;
      try {
        body = JSON.parse(
          event.isBase64Encoded
            ? Buffer.from(event.body, 'base64').toString('utf8')
            : event.body,
        );
      } catch {
        throw new ActivationError('INVALID_REQUEST', 400);
      }
      const parsed = activationRequestSchema.safeParse(body);
      if (!parsed.success) throw new ActivationError('INVALID_REQUEST', 400);
      request = parsed.data;
      const result = await activate(request);
      log({
        requestId,
        installationId: request.installationId,
        licenseId: result.licenseId,
        result: 'ACTIVATED',
      });
      return respond(200, result);
    } catch (error) {
      const code =
        error instanceof ActivationError ? error.code : 'SERVICE_UNAVAILABLE';
      log({
        requestId,
        ...(request ? { installationId: request.installationId } : {}),
        result: code,
      });
      return respond(
        error instanceof ActivationError ? error.statusCode : 500,
        { error: code },
      );
    }
  };
}
