import { expect, it, vi } from 'vitest';
import { createTrackingResponseSchema } from '@email-tracker/shared';
import { TrackingService } from './trackingService.js';
const identity = { licenseId: 'lic_test', installationId: crypto.randomUUID() };
const request = { recipient: 'client@example.com', subject: '' };
it('generates unique server UUIDs and persists identity, timestamp and CREATED', async () => {
  const repository = { create: vi.fn().mockResolvedValue(undefined) };
  const service = new TrackingService(
    repository,
    'https://tracking.example.test',
  );
  const before = Date.now();
  const response = await service.create(identity, request);
  expect(createTrackingResponseSchema.parse(response)).toEqual(response);
  expect(response.trackingUrl).toBe(
    `https://tracking.example.test/o/${response.trackingId}`,
  );
  expect(Date.parse(response.createdAt)).toBeGreaterThanOrEqual(before);
  expect(repository.create).toHaveBeenCalledWith({
    ...identity,
    ...request,
    trackingId: response.trackingId,
    createdAt: response.createdAt,
    status: 'CREATED',
  });
  expect((await service.create(identity, request)).trackingId).not.toBe(
    response.trackingId,
  );
});
it.each([
  { ...request, recipient: 'invalid' },
  { ...request, subject: 'a'.repeat(999) },
  { ...request, trackingId: crypto.randomUUID() },
])('never persists invalid input', async (input) => {
  const repository = { create: vi.fn() };
  await expect(
    new TrackingService(repository, 'https://tracking.example.test').create(
      identity,
      input,
    ),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(repository.create).not.toHaveBeenCalled();
});
it('does not return success when persistence fails', async () => {
  const repository = {
    create: vi.fn().mockRejectedValue(new Error('DynamoDB internal')),
  };
  await expect(
    new TrackingService(repository, 'https://tracking.example.test').create(
      identity,
      request,
    ),
  ).rejects.toThrow('DynamoDB internal');
});

it('creates the production pixel URL from backend configuration without duplicate slashes', async () => {
  const { readTrackingConfig } = await import('./trackingConfig.js');
  for (const override of [undefined, 'https://tracking.cesaragudelo.com/']) {
    const config = readTrackingConfig({
      TRACKING_TABLE_NAME: 'test',
      JWT_SECRET_ARN: 'test',
      TRACKING_BASE_URL: override,
    });
    const service = new TrackingService(
      { create: vi.fn().mockResolvedValue(undefined) },
      config.TRACKING_BASE_URL,
    );
    const result = await service.create(identity, request);
    expect(result.trackingUrl).toBe(
      `https://tracking.cesaragudelo.com/o/${result.trackingId}`,
    );
  }
});
