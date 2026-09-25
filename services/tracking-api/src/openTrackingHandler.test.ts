import { expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createOpenTrackingHandler } from './openTrackingHandler.js';
import { OpenTrackingService } from './openTrackingService.js';
import { TRANSPARENT_PNG_BASE64 } from './pixel.js';
const id = '550e8400-e29b-41d4-a716-446655440000';
function input(trackingId: string | undefined = id): APIGatewayProxyEventV2 {
  return {
    pathParameters: { trackingId },
    headers: { 'User-Agent': 'Raw Agent' },
    requestContext: { requestId: 'request-1', http: { sourceIp: '192.0.2.1' } },
  } as APIGatewayProxyEventV2;
}
function setup() {
  const repository = {
    getTracking: vi.fn().mockResolvedValue({ trackingId: id }),
    createOpenEvent: vi.fn().mockResolvedValue(undefined),
  };
  const log = vi.fn();
  const service = new OpenTrackingService(repository, log);
  return {
    repository,
    log,
    handler: createOpenTrackingHandler(service.open.bind(service), log),
  };
}
it('returns binary PNG without authorization, with all anti-cache headers', async () => {
  const { handler, repository } = setup();
  const response = await handler(input());
  expect(response.statusCode).toBe(200);
  expect(response.isBase64Encoded).toBe(true);
  expect(response.headers).toEqual({
    'content-type': 'image/png',
    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    pragma: 'no-cache',
    expires: '0',
  });
  expect(response.body).toBe(TRANSPARENT_PNG_BASE64);
  expect(Buffer.from(response.body!, 'base64').subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(repository.createOpenEvent).toHaveBeenCalledWith(
    expect.objectContaining({ ip: '192.0.2.1', userAgent: 'Raw Agent' }),
  );
});
it('ignores Authorization and does not reflect client headers', async () => {
  const { handler } = setup();
  const request = input();
  request.headers = {
    Authorization: 'Bearer invalid-token',
    'User-Agent': 'private-ua',
    'X-Extra': 'private-header',
  };
  const response = await handler(request);
  expect(response.statusCode).toBe(200);
  expect(JSON.stringify(response)).not.toContain('private');
  expect(JSON.stringify(response)).not.toContain('invalid-token');
});
it.each(['invalid', '', `TRACKING#${id}`])(
  'returns 400 JSON for invalid UUID %s without DB calls',
  async (trackingId) => {
    const { handler, repository } = setup();
    const response = await handler(input(trackingId));
    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('{"error":"INVALID_TRACKING_ID"}');
    expect(response.isBase64Encoded).not.toBe(true);
    expect(repository.getTracking).not.toHaveBeenCalled();
    expect(repository.createOpenEvent).not.toHaveBeenCalled();
  },
);
it('requires ID from pathParameters, ignoring query and body IDs', async () => {
  const { handler, repository } = setup();
  const request = input();
  delete request.pathParameters;
  request.queryStringParameters = { trackingId: id };
  request.body = JSON.stringify({ trackingId: id });
  expect((await handler(request)).statusCode).toBe(400);
  expect(repository.getTracking).not.toHaveBeenCalled();
});
it('returns 404 without a pixel or write when EMAIL does not exist', async () => {
  const { handler, repository } = setup();
  repository.getTracking.mockResolvedValue(undefined);
  const response = await handler(input());
  expect(response.statusCode).toBe(404);
  expect(response.body).toBe('{"error":"NOT_FOUND"}');
  expect(repository.createOpenEvent).not.toHaveBeenCalled();
});
it('returns safe 500 for GetItem failure and does not attempt PutItem', async () => {
  const { handler, repository, log } = setup();
  repository.getTracking.mockRejectedValue(
    new Error('AWS secret read details'),
  );
  const response = await handler(input());
  expect(response.statusCode).toBe(500);
  expect(response.body).toBe('{"error":"SERVICE_UNAVAILABLE"}');
  expect(repository.createOpenEvent).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith({
    requestId: 'request-1',
    errorCategory: 'SERVICE_UNAVAILABLE',
  });
  expect(JSON.stringify(log.mock.calls)).not.toContain('AWS secret');
});
it('returns the identical 200 PNG after PutItem failure with a structured error', async () => {
  const { handler, repository, log } = setup();
  const success = await handler(input());
  repository.createOpenEvent.mockRejectedValue(
    new Error('AWS secret write details'),
  );
  const failure = await handler(input());
  expect(failure).toEqual(success);
  expect(failure.statusCode).toBe(200);
  expect(failure.body).toBe(TRANSPARENT_PNG_BASE64);
  expect(log).toHaveBeenLastCalledWith({
    requestId: 'request-1',
    trackingId: id,
    eventId: expect.any(String),
    eventType: 'OPEN',
    persistenceSuccess: false,
    errorCategory: 'OPEN_WRITE_FAILED',
  });
  expect(JSON.stringify([failure, log.mock.calls])).not.toContain('AWS secret');
});
it('continues when source IP and User-Agent are absent', async () => {
  const { handler, repository } = setup();
  const request = {
    pathParameters: { trackingId: id },
    requestContext: { requestId: 'request' },
  } as APIGatewayProxyEventV2;
  expect((await handler(request)).statusCode).toBe(200);
  expect(repository.createOpenEvent).toHaveBeenCalledWith(
    expect.objectContaining({ ip: null, userAgent: null }),
  );
});
