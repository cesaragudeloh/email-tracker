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

it('validates query responses with CREATED and nullable metadata', async () => {
  const { getTrackingResponseSchema } = await import('./tracking.js');
  const empty = {
    ...request,
    trackingId: crypto.randomUUID(),
    createdAt: '2026-09-24T10:00:00.000Z',
    status: 'CREATED',
    openCount: 0,
    firstOpenedAt: null,
    lastOpenedAt: null,
    events: [],
  };
  expect(getTrackingResponseSchema.parse(empty)).toEqual(empty);
  const open = {
    ...empty,
    status: 'OPEN_DETECTED',
    openCount: 1,
    firstOpenedAt: empty.createdAt,
    lastOpenedAt: empty.createdAt,
    events: [
      {
        eventId: crypto.randomUUID(),
        openedAt: empty.createdAt,
        ip: null,
        userAgent: null,
      },
    ],
  };
  expect(getTrackingResponseSchema.parse(open)).toEqual(open);
  for (const invalid of [
    { ...empty, status: 'SENT' },
    { ...empty, openCount: -1 },
    { ...empty, licenseId: 'private' },
    { ...open, events: [{ ...open.events[0], browser: 'future' }] },
  ])
    expect(getTrackingResponseSchema.safeParse(invalid).success).toBe(false);
});
