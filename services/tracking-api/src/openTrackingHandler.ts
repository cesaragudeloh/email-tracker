import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  OpenTrackingError,
  logOpen,
  type OpenLogEntry,
} from './openTracking.js';
import type { OpenTrackingService } from './openTrackingService.js';
import { extractOpenMetadata } from './requestMetadata.js';
import { PIXEL_CACHE_HEADERS, TRANSPARENT_PNG_BASE64 } from './pixel.js';

export function createOpenTrackingHandler(
  open: OpenTrackingService['open'],
  log: (entry: OpenLogEntry) => void = logOpen,
) {
  return async (
    event: APIGatewayProxyEventV2,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = event.requestContext.requestId;
    try {
      await open(
        event.pathParameters?.trackingId,
        extractOpenMetadata(event),
        requestId,
      );
      return {
        statusCode: 200,
        headers: { ...PIXEL_CACHE_HEADERS, 'content-type': 'image/png' },
        isBase64Encoded: true,
        body: TRANSPARENT_PNG_BASE64,
      };
    } catch (error) {
      const code =
        error instanceof OpenTrackingError ? error.code : 'SERVICE_UNAVAILABLE';
      log({ requestId, errorCategory: code });
      return {
        statusCode: error instanceof OpenTrackingError ? error.statusCode : 500,
        headers: { ...PIXEL_CACHE_HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify({ error: code }),
      };
    }
  };
}
