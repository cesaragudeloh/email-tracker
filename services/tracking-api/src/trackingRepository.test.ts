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

it('queries OPEN prefix in ascending order and follows all DynamoDB pages', async () => {
  const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
  const first = {
    eventId: crypto.randomUUID(),
    openedAt: '2026-09-24T10:00:00.000Z',
    ip: '192.0.2.1',
    userAgent: 'Raw agent',
  };
  const last = {
    ...first,
    eventId: crypto.randomUUID(),
    openedAt: '2026-09-24T11:00:00.000Z',
    ip: null,
    userAgent: null,
  };
  const cursor = {
    PK: `TRACKING#${record.trackingId}`,
    SK: `OPEN#${first.openedAt}#${first.eventId}`,
  };
  const send = vi
    .fn()
    .mockResolvedValueOnce({
      Items: [{ ...first, ...cursor, eventType: 'OPEN' }],
      LastEvaluatedKey: cursor,
    })
    .mockResolvedValueOnce({ Items: [last] });
  expect(
    await new DynamoTrackingRepository({ send }, 'table').listOpenEvents(
      record.trackingId,
    ),
  ).toEqual([first, last]);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0][0]).toBeInstanceOf(QueryCommand);
  const input = {
    TableName: 'table',
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `TRACKING#${record.trackingId}`,
      ':prefix': 'OPEN#',
    },
    ScanIndexForward: true,
    ConsistentRead: true,
  };
  expect(send.mock.calls[0][0].input).toEqual(input);
  expect(send.mock.calls[1][0].input).toEqual({
    ...input,
    ExclusiveStartKey: cursor,
  });
});
it('returns an empty OPEN history', async () => {
  const send = vi.fn().mockResolvedValue({});
  expect(
    await new DynamoTrackingRepository({ send }, 'table').listOpenEvents(
      record.trackingId,
    ),
  ).toEqual([]);
});
it('does not return partial history if a later Query page fails', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: { PK: 'key', SK: 'key' },
    })
    .mockRejectedValueOnce(new Error('query failure'));
  await expect(
    new DynamoTrackingRepository({ send }, 'table').listOpenEvents(
      record.trackingId,
    ),
  ).rejects.toThrow('query failure');
});
it('rejects malformed persisted OPEN events', async () => {
  const send = vi.fn().mockResolvedValue({ Items: [{ eventId: 'invalid' }] });
  await expect(
    new DynamoTrackingRepository({ send }, 'table').listOpenEvents(
      record.trackingId,
    ),
  ).rejects.toThrow();
});
