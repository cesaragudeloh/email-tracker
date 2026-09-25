import { expect, it } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { extractOpenMetadata } from './requestMetadata.js';
const event = (headers: Record<string, string> = {}, sourceIp?: string) =>
  ({
    headers,
    requestContext: { http: { sourceIp } },
  }) as APIGatewayProxyEventV2;
it('prefers API Gateway sourceIp and ignores forwarded headers', () => {
  expect(
    extractOpenMetadata(event({ 'x-forwarded-for': 'spoofed' }, '192.0.2.1'))
      .ip,
  ).toBe('192.0.2.1');
});
it('does not fall back to forwarded IP when sourceIp is missing', () => {
  expect(
    extractOpenMetadata(event({ 'x-forwarded-for': 'spoofed' })).ip,
  ).toBeNull();
});
it('preserves IPv6 source addresses', () => {
  expect(extractOpenMetadata(event({}, '2001:db8::1')).ip).toBe('2001:db8::1');
});
it.each(['user-agent', 'User-Agent', 'USER-AGENT', 'uSeR-aGeNt'])(
  'captures raw header %s',
  (name) => {
    expect(
      extractOpenMetadata(event({ [name]: 'Raw Agent/1.0 (proxy)' })).userAgent,
    ).toBe('Raw Agent/1.0 (proxy)');
  },
);
it('uses null for missing metadata including http context', () => {
  expect(
    extractOpenMetadata({ requestContext: {} } as APIGatewayProxyEventV2),
  ).toEqual({ ip: null, userAgent: null });
});
