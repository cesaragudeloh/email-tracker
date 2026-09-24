import { describe, expect, it, vi } from 'vitest';
import {
  GetCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoLicenseRepository } from './repository.js';
import { createLicense } from './license.js';
import { ConcurrentActivationError } from './errors.js';

function setup() {
  const send = vi.fn();
  const repository = new DynamoLicenseRepository(
    { send } as unknown as DynamoDBDocumentClient,
    'licenses-test',
  );
  return { send, repository };
}

describe('DynamoDB repository (mocked SDK)', () => {
  it('uses strongly consistent keyed reads, never scans', async () => {
    const { send, repository } = setup();
    const { license } = createLicense(2);
    send
      .mockResolvedValueOnce({ Item: { licenseId: license.licenseId } })
      .mockResolvedValueOnce({ Item: license });
    expect(await repository.findByHash(license.activationCodeHash)).toEqual(
      license,
    );
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toMatchObject({
      ConsistentRead: true,
      Key: { PK: `CODE#${license.activationCodeHash}`, SK: 'LOOKUP' },
    });
  });
  it('returns undefined for a missing hash', async () => {
    const { send, repository } = setup();
    send.mockResolvedValue({});
    expect(await repository.findByHash('missing')).toBeUndefined();
  });
  it('refuses an inconsistent lookup hash', async () => {
    const { send, repository } = setup();
    const { license } = createLicense(1);
    send
      .mockResolvedValueOnce({ Item: { licenseId: license.licenseId } })
      .mockResolvedValueOnce({ Item: license });
    expect(await repository.findByHash('wrong')).toBeUndefined();
  });
  it('atomically increments the counter with a limit and creates a unique installation', async () => {
    const { send, repository } = setup();
    send.mockResolvedValue({});
    await repository.register(
      createLicense(1).license,
      'installation',
      false,
      1800000000,
    );
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(TransactWriteCommand);
    const [counter, installation] = command.input.TransactItems;
    expect(counter.Update.ConditionExpression).toContain(
      'activeDevices < maxDevices',
    );
    expect(counter.Update.ConditionExpression).toContain('expiresAt > :now');
    expect(counter.Update.ConditionExpression).toContain('#status = :active');
    expect(installation.Put.ConditionExpression).toBe(
      'attribute_not_exists(PK)',
    );
    expect(installation.Put.Item.status).toBe('ACTIVE');
  });
  it('reactivation only updates lastSeenAt and checks the current license', async () => {
    const { send, repository } = setup();
    send.mockResolvedValue({});
    await repository.register(
      createLicense(1).license,
      'installation',
      true,
      1800000000,
    );
    const [license, installation] = send.mock.calls[0][0].input.TransactItems;
    expect(license.ConditionCheck.ConditionExpression).toContain(
      '#status = :active',
    );
    expect(installation.Update.UpdateExpression).toBe(
      'SET lastSeenAt = :timestamp',
    );
    expect(installation.Update.ConditionExpression).toBe('#status = :active');
  });
  it('turns transaction conflicts into typed retries', async () => {
    const { send, repository } = setup();
    send.mockRejectedValue(
      Object.assign(new Error('conflict'), {
        name: 'TransactionCanceledException',
      }),
    );
    await expect(
      repository.register(createLicense(1).license, 'id', false, 1800000000),
    ).rejects.toBeInstanceOf(ConcurrentActivationError);
  });
  it('propagates other SDK errors', async () => {
    const { send, repository } = setup();
    send.mockRejectedValue(new Error('offline'));
    await expect(repository.findByHash('hash')).rejects.toThrow('offline');
    await expect(
      repository.register(createLicense(1).license, 'id', false, 1800000000),
    ).rejects.toThrow('offline');
  });
});

it('guards against a changed license expiration between read and commit', async () => {
  const { send, repository } = setup();
  send.mockResolvedValue({});
  const license = { ...createLicense(1).license, expiresAt: 1800000060 };
  await repository.register(license, 'installation', false, 1800000000);
  const update = send.mock.calls[0][0].input.TransactItems[0].Update;
  expect(update.ConditionExpression).toContain(
    'expiresAt = :expectedExpiration',
  );
  expect(update.ExpressionAttributeValues[':expectedExpiration']).toBe(
    license.expiresAt,
  );
});
