import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { OpenMetadata } from './openTracking.js';

export function extractOpenMetadata(
  event: APIGatewayProxyEventV2,
): OpenMetadata {
  return {
    ip: event.requestContext.http?.sourceIp ?? null,
    userAgent:
      Object.entries(event.headers ?? {}).find(
        ([name]) => name.toLowerCase() === 'user-agent',
      )?.[1] ?? null,
  };
}
