import { expect, it, vi } from 'vitest';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoTrackingRepository } from './trackingRepository.js';
const record = {
  trackingId: crypto.randomUUID(),
  recipient: 'client@example.com',
  subject: '',
  createdAt: new Date().toISOString(),
  licenseId: 'lic_test',
  installationId: crypto.randomUUID(),
  status: 'CREATED' as const,
};
it('writes exactly one EMAIL record and prevents overwrite', async () => {
  const send = vi.fn().mockResolvedValue({});
  await new DynamoTrackingRepository({ send }, 'tracking-table').create(record);
  expect(send).toHaveBeenCalledTimes(1);
  const command = send.mock.calls[0][0];
  expect(command).toBeInstanceOf(PutCommand);
  expect(command.input).toEqual({
    TableName: 'tracking-table',
    Item: { ...record, PK: `TRACKING#${record.trackingId}`, SK: 'EMAIL' },
    ConditionExpression: 'attribute_not_exists(PK)',
  });
});
it('propagates DynamoDB failure', async () => {
  const send = vi.fn().mockRejectedValue(new Error('write failed'));
  await expect(
    new DynamoTrackingRepository({ send }, 'table').create(record),
  ).rejects.toThrow('write failed');
});

it('gets only EMAIL with a consistent keyed read and strips storage keys', async () => {
  const send = vi.fn().mockResolvedValue({
    Item: { ...record, PK: `TRACKING#${record.trackingId}`, SK: 'EMAIL' },
  });
  const repository = new DynamoTrackingRepository({ send }, 'tracking-table');
  expect(await repository.getTracking(record.trackingId)).toEqual(record);
  expect(send.mock.calls[0][0]).toBeInstanceOf(GetCommand);
  expect(send.mock.calls[0][0].input).toEqual({
    TableName: 'tracking-table',
    Key: { PK: `TRACKING#${record.trackingId}`, SK: 'EMAIL' },
    ConsistentRead: true,
  });
});
it('returns undefined when EMAIL is absent', async () => {
  const send = vi.fn().mockResolvedValue({});
  expect(
    await new DynamoTrackingRepository({ send }, 'table').getTracking(
      record.trackingId,
    ),
  ).toBeUndefined();
});
it('propagates GetItem errors', async () => {
  const send = vi.fn().mockRejectedValue(new Error('read failure'));
  await expect(
    new DynamoTrackingRepository({ send }, 'table').getTracking(
      record.trackingId,
    ),
  ).rejects.toThrow('read failure');
});
it.each([{}, { ...record, trackingId: crypto.randomUUID() }])(
  'rejects corrupt EMAIL records',
  async (Item) => {
    const send = vi.fn().mockResolvedValue({ Item });
    await expect(
      new DynamoTrackingRepository({ send }, 'table').getTracking(
        record.trackingId,
      ),
    ).rejects.toThrow();
  },
);
it('writes independent OPEN records with chronological unique keys and null metadata', async () => {
  const send = vi.fn().mockResolvedValue({});
  const repository = new DynamoTrackingRepository({ send }, 'tracking-table');
  const event = {
    trackingId: record.trackingId,
    eventId: crypto.randomUUID(),
    eventType: 'OPEN' as const,
    openedAt: '2026-09-24T21:15:22.123Z',
    ip: null,
    userAgent: null,
  };
  const second = { ...event, eventId: crypto.randomUUID() };
  await repository.createOpenEvent(event);
  await repository.createOpenEvent(second);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0][0]).toBeInstanceOf(PutCommand);
  expect(send.mock.calls[0][0].input).toEqual({
    TableName: 'tracking-table',
    Item: {
      ...event,
      PK: `TRACKING#${event.trackingId}`,
      SK: `OPEN#${event.openedAt}#${event.eventId}`,
    },
    ConditionExpression: 'attribute_not_exists(PK)',
  });
  expect(send.mock.calls[1][0].input.Item.SK).toBe(
    `OPEN#${second.openedAt}#${second.eventId}`,
  );
  expect(send.mock.calls[1][0].input.Item.SK).not.toBe(
    send.mock.calls[0][0].input.Item.SK,
  );
});
it('propagates OPEN PutItem failures for the service to handle', async () => {
  const send = vi.fn().mockRejectedValue(new Error('write failure'));
  await expect(
    new DynamoTrackingRepository({ send }, 'table').createOpenEvent({
      trackingId: record.trackingId,
      eventId: crypto.randomUUID(),
      eventType: 'OPEN',
      openedAt: new Date().toISOString(),
      ip: '192.0.2.1',
      userAgent: 'Raw Agent',
    }),
  ).rejects.toThrow('write failure');
});
