import { expect, it, vi } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
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
