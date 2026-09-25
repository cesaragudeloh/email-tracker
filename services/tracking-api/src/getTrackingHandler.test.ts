import { beforeEach, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createGetTrackingHandler } from './getTrackingHandler.js';
import { createAuthorization } from './authorization.js';
import { verifyToken } from './token.js';
import { GetTrackingService } from './getTrackingService.js';
vi.mock('./token.js', () => ({ verifyToken: vi.fn() }));
const identity = {
  licenseId: 'lic_owner',
  installationId: crypto.randomUUID(),
  iat: 1,
  exp: 9999999999,
};
const record = {
  ...identity,
  trackingId: crypto.randomUUID(),
  recipient: 'private@example.com',
  subject: 'Private subject',
  createdAt: '2026-09-24T10:00:00.000Z',
  status: 'CREATED',
};
function setup() {
  const repository = {
    getTracking: vi.fn().mockResolvedValue(record),
    listOpenEvents: vi.fn().mockResolvedValue([
      {
        eventId: crypto.randomUUID(),
        openedAt: record.createdAt,
        ip: '192.0.2.123',
        userAgent: 'Private Agent',
      },
    ]),
  };
  const service = new GetTrackingService(repository);
  const log = vi.fn();
  const handler = createGetTrackingHandler(
    createAuthorization(async () => new Uint8Array(32)),
    service.get.bind(service),
    log,
  );
  return { repository, log, handler };
}
function event(
  id: string | undefined = record.trackingId,
  token: string | undefined = 'test-token',
): APIGatewayProxyEventV2 {
  return {
    pathParameters: { trackingId: id },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    requestContext: { requestId: 'request-1' },
  } as APIGatewayProxyEventV2;
}
beforeEach(() => {
  vi.mocked(verifyToken).mockReset().mockResolvedValue(identity);
});
it('accepts path UUID, normalizes case and emits only safe structured logs', async () => {
  const { handler, repository, log } = setup();
  const response = await handler(event(record.trackingId.toUpperCase()));
  expect(response.statusCode).toBe(200);
  expect(repository.getTracking).toHaveBeenCalledWith(record.trackingId);
  expect(verifyToken).toHaveBeenCalledWith(
    'test-token',
    expect.any(Uint8Array),
  );
  expect(response.headers?.['cache-control']).toBe('no-store');
  expect(log).toHaveBeenCalledWith({
    requestId: 'request-1',
    trackingId: record.trackingId,
    result: 'OPEN_DETECTED',
  });
  for (const value of [
    record.recipient,
    record.subject,
    'test-token',
    '192.0.2.123',
    'Private Agent',
  ])
    expect(JSON.stringify(log.mock.calls)).not.toContain(value);
});
it.each(['bad', '../id', ''])(
  'rejects invalid path UUID %s without reading DynamoDB',
  async (id) => {
    const { handler, repository } = setup();
    expect((await handler(event(id))).statusCode).toBe(400);
    expect(repository.getTracking).not.toHaveBeenCalled();
    expect(repository.listOpenEvents).not.toHaveBeenCalled();
  },
);
it('requires pathParameters instead of query or body', async () => {
  const { handler, repository } = setup();
  const request = event();
  delete request.pathParameters;
  request.body = JSON.stringify({ trackingId: record.trackingId });
  request.queryStringParameters = { trackingId: record.trackingId };
  expect((await handler(request)).statusCode).toBe(400);
  expect(repository.getTracking).not.toHaveBeenCalled();
});
it('returns 401 without authorization', async () => {
  const { handler, repository } = setup();
  const request = event();
  request.headers = {};
  expect((await handler(request)).statusCode).toBe(401);
  expect(verifyToken).not.toHaveBeenCalled();
  expect(repository.getTracking).not.toHaveBeenCalled();
});
it.each([
  'invalid signature',
  'expired token',
  'invalid licenseId',
  'invalid installationId',
])('maps JWT verifier rejection (%s) to 401', async (reason) => {
  vi.mocked(verifyToken).mockRejectedValue(new Error(reason));
  const { handler, repository } = setup();
  expect(await handler(event())).toMatchObject({
    statusCode: 401,
    body: '{"error":"UNAUTHORIZED"}',
  });
  expect(repository.getTracking).not.toHaveBeenCalled();
});
it.each([undefined, { ...record, licenseId: 'foreign' }])(
  'returns identical safe 404 for absent or foreign tracking',
  async (email) => {
    const { handler, repository } = setup();
    repository.getTracking.mockResolvedValue(email);
    expect(await handler(event())).toMatchObject({
      statusCode: 404,
      body: '{"error":"NOT_FOUND"}',
    });
    expect(repository.listOpenEvents).not.toHaveBeenCalled();
  },
);
it.each(['getTracking', 'listOpenEvents'] as const)(
  'returns safe 500 on %s failure',
  async (method) => {
    const { handler, repository, log } = setup();
    repository[method].mockRejectedValue(new Error('private details'));
    expect(await handler(event())).toMatchObject({
      statusCode: 500,
      body: '{"error":"SERVICE_UNAVAILABLE"}',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private details');
  },
);
