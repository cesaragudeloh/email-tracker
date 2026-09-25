import { expect, it } from 'vitest';
import {
  createTrackingRequestSchema,
  createTrackingResponseSchema,
  trackingStatusSchema,
} from './tracking.js';
const request = { recipient: 'client@example.com', subject: 'Follow-up' };
it('accepts a valid request and an empty subject', () => {
  expect(createTrackingRequestSchema.parse(request)).toEqual(request);
  expect(
    createTrackingRequestSchema.parse({ ...request, subject: '' }).subject,
  ).toBe('');
});
it.each([
  {},
  { subject: '' },
  { ...request, recipient: 'invalid' },
  { ...request, subject: 123 },
  { ...request, subject: 'a'.repeat(999) },
  ...[
    'trackingId',
    'body',
    'attachments',
    'cookies',
    'senderPassword',
    'gmailToken',
    'licenseId',
    'installationId',
  ].map((field) => ({ ...request, [field]: 'forbidden' })),
])('rejects invalid or extra request fields: %j', (input) => {
  expect(createTrackingRequestSchema.safeParse(input).success).toBe(false);
});
it('accepts the subject boundary', () => {
  expect(
    createTrackingRequestSchema.safeParse({
      ...request,
      subject: 'a'.repeat(998),
    }).success,
  ).toBe(true);
});
it('validates response UUID, URL, timestamp and CREATED status', () => {
  const response = {
    trackingId: crypto.randomUUID(),
    trackingUrl: 'https://example.test/o/id',
    createdAt: new Date().toISOString(),
  };
  expect(createTrackingResponseSchema.parse(response)).toEqual(response);
  for (const field of ['trackingId', 'trackingUrl', 'createdAt']) {
    expect(
      createTrackingResponseSchema.safeParse({ ...response, [field]: 'bad' })
        .success,
    ).toBe(false);
  }
  expect(trackingStatusSchema.parse('CREATED')).toBe('CREATED');
  expect(trackingStatusSchema.safeParse('SENT').success).toBe(false);
});
