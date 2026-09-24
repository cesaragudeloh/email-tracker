import { describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createHandler } from './handler.js';
import { ActivationError } from './errors.js';

const request = {
  activationCode: 'ABCD-EFGH',
  installationId: '8a73e54e-c33f-40ca-a2dc-06626851744d',
};
const event = (body: string | undefined): APIGatewayProxyEventV2 =>
  ({
    body,
    requestContext: { requestId: 'request-123' },
  }) as APIGatewayProxyEventV2;

describe('POST /api/activate handler', () => {
  it('returns success with no-store and structured safe logs', async () => {
    const result = {
      status: 'ACTIVATED' as const,
      accessToken: 'fake-token',
      expiresIn: 60,
      licenseId: 'lic_test',
      installationId: request.installationId,
    };
    const log = vi.fn();
    const response = await createHandler(
      vi.fn().mockResolvedValue(result),
      log,
    )(event(JSON.stringify(request)));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body!)).toEqual(result);
    expect(response.headers?.['cache-control']).toBe('no-store');
    expect(log).toHaveBeenCalledWith({
      requestId: 'request-123',
      installationId: request.installationId,
      licenseId: 'lic_test',
      result: 'ACTIVATED',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      request.activationCode,
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('fake-token');
  });
  it.each([
    undefined,
    '{',
    '{}',
    'x'.repeat(4097),
    JSON.stringify({ ...request, installationId: 'wrong' }),
  ])('rejects invalid requests with 400', async (body) => {
    const activate = vi.fn();
    expect(
      (await createHandler(activate, vi.fn())(event(body))).statusCode,
    ).toBe(400);
    expect(activate).not.toHaveBeenCalled();
  });
  it('accepts API Gateway base64 bodies', async () => {
    const activate = vi.fn().mockResolvedValue({ licenseId: 'lic_test' });
    const input = {
      ...event(Buffer.from(JSON.stringify(request)).toString('base64')),
      isBase64Encoded: true,
    };
    expect((await createHandler(activate, vi.fn())(input)).statusCode).toBe(
      200,
    );
  });
  it('maps a revoked license to 403', async () => {
    const response = await createHandler(
      vi.fn().mockRejectedValue(new ActivationError('LICENSE_REVOKED')),
      vi.fn(),
    )(event(JSON.stringify(request)));
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body!)).toEqual({ error: 'LICENSE_REVOKED' });
  });
  it('sanitizes repository errors and does not log internal details', async () => {
    const log = vi.fn();
    const response = await createHandler(
      vi.fn().mockRejectedValue(new Error('AWS_SECRET_INTERNAL')),
      log,
    )(event(JSON.stringify(request)));
    expect(response.statusCode).toBe(500);
    expect(response.body).toBe('{"error":"SERVICE_UNAVAILABLE"}');
    expect(JSON.stringify(log.mock.calls)).not.toContain('AWS_SECRET_INTERNAL');
  });
});
