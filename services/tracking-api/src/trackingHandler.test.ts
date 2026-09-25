import { expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createTrackingHandler } from './trackingHandler.js';
import { createAuthorization } from './authorization.js';
import { signToken } from './token.js';
import { TrackingService } from './trackingService.js';
const key = new TextEncoder().encode(
  'test-only-key-longer-than-thirty-two-bytes',
);
const identity = { licenseId: 'lic_test', installationId: crypto.randomUUID() };
const request = {
  recipient: 'client@example.com',
  subject: 'Sensitive subject',
};
const event = (
  body: string | undefined,
  token?: string,
): APIGatewayProxyEventV2 =>
  ({
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    requestContext: { requestId: 'request-1' },
  }) as APIGatewayProxyEventV2;
async function setup(exp = Math.floor(Date.now() / 1000) + 3600) {
  const token = await signToken(
    { ...identity, iat: Math.max(0, exp - 86400), exp },
    key,
  );
  const repository = { create: vi.fn().mockResolvedValue(undefined) };
  const service = new TrackingService(
    repository,
    'https://tracking.example.test',
  );
  const log = vi.fn();
  const handler = createTrackingHandler(
    createAuthorization(async () => key),
    service.create.bind(service),
    log,
  );
  return { token, repository, log, handler };
}
it('returns 201 after persistence with safe structured logs', async () => {
  const { handler, token, repository, log } = await setup();
  const response = await handler(event(JSON.stringify(request), token));
  expect(response.statusCode).toBe(201);
  expect(repository.create).toHaveBeenCalledOnce();
  expect(response.headers?.['cache-control']).toBe('no-store');
  expect(log).toHaveBeenCalledWith({
    requestId: 'request-1',
    result: 'CREATED',
    trackingId: JSON.parse(response.body!).trackingId,
  });
  for (const sensitive of [token, request.recipient, request.subject])
    expect(JSON.stringify(log.mock.calls)).not.toContain(sensitive);
});
it.each([undefined, 'invalid'])(
  'returns 401 without a valid token',
  async (token) => {
    const { handler, repository } = await setup();
    expect(
      (await handler(event(JSON.stringify(request), token))).statusCode,
    ).toBe(401);
    expect(repository.create).not.toHaveBeenCalled();
  },
);
it('returns 401 for expiration', async () => {
  const { handler, token, repository } = await setup(1);
  expect(
    (await handler(event(JSON.stringify(request), token))).statusCode,
  ).toBe(401);
  expect(repository.create).not.toHaveBeenCalled();
});
it.each([
  undefined,
  '{',
  '{}',
  'a'.repeat(16385),
  JSON.stringify({ ...request, recipient: 'bad' }),
  JSON.stringify({ ...request, body: 'forbidden' }),
])('returns 400 for invalid input', async (body) => {
  const { handler, token, repository } = await setup();
  expect((await handler(event(body, token))).statusCode).toBe(400);
  expect(repository.create).not.toHaveBeenCalled();
});
it('accepts base64 JSON and case-insensitive authorization headers', async () => {
  const { handler, token } = await setup();
  const input = event(Buffer.from(JSON.stringify(request)).toString('base64'));
  input.isBase64Encoded = true;
  input.headers = { Authorization: `bearer ${token}` };
  expect((await handler(input)).statusCode).toBe(201);
});
it('sanitizes internal persistence failures in responses and logs', async () => {
  const { handler, token, repository, log } = await setup();
  repository.create.mockRejectedValue(new Error('DynamoDB secret detail'));
  const response = await handler(event(JSON.stringify(request), token));
  expect(response.statusCode).toBe(500);
  expect(response.body).toBe('{"error":"SERVICE_UNAVAILABLE"}');
  expect(JSON.stringify(log.mock.calls)).not.toContain('secret detail');
});
