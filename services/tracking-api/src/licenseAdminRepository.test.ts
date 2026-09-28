import { expect, it, vi } from 'vitest';
import {
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  LicenseAdminRepository,
  LicenseNotFoundError,
} from './licenseAdminRepository.js';
import { createLicense } from './license.js';

const license = createLicense(2).license;
async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of items) result.push(item);
  return result;
}

it('scans only administrative license summaries and follows even empty filtered pages', async () => {
  const cursor = { PK: 'CODE#test', SK: 'LOOKUP' };
  const send = vi
    .fn()
    .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: cursor })
    .mockResolvedValueOnce({
      Items: [{ ...license, activationCode: 'secret', jwt: 'secret' }],
    });
  const records = await collect(
    new LicenseAdminRepository({ send }, 'licenses').list(),
  );
  expect(records).toEqual([
    {
      licenseId: license.licenseId,
      status: 'ACTIVE',
      maxDevices: 2,
      activeDevices: 0,
      createdAt: license.createdAt,
    },
  ]);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0][0]).toBeInstanceOf(ScanCommand);
  expect(send.mock.calls[0][0].input).toMatchObject({
    TableName: 'licenses',
    Limit: 100,
    FilterExpression: 'SK = :license AND begins_with(PK, :prefix)',
    ProjectionExpression:
      'licenseId, #status, maxDevices, activeDevices, createdAt, expiresAt',
  });
  expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual(cursor);
});
it('finishes an empty list and handles an empty terminal pagination key', async () => {
  const send = vi.fn().mockResolvedValue({ LastEvaluatedKey: {} });
  expect(
    await collect(new LicenseAdminRepository({ send }, 'licenses').list()),
  ).toEqual([]);
  expect(send).toHaveBeenCalledTimes(1);
});
it.each(['ACTIVE', 'REVOKED'])(
  'revokes %s idempotently without deleting history or creating missing licenses',
  async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ Attributes: { ...license, status: 'REVOKED' } });
    expect(
      await new LicenseAdminRepository({ send }, 'licenses').revoke(
        license.licenseId,
      ),
    ).toMatchObject({
      status: 'REVOKED',
      activeDevices: 0,
      createdAt: license.createdAt,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(UpdateCommand);
    expect(send.mock.calls[0][0].input).toEqual({
      TableName: 'licenses',
      Key: { PK: `LICENSE#${license.licenseId}`, SK: 'LICENSE' },
      UpdateExpression: 'SET #status = :revoked',
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':revoked': 'REVOKED' },
      ReturnValues: 'ALL_NEW',
    });
  },
);
it('reports a nonexistent license on conditional failure without an upsert', async () => {
  const send = vi.fn().mockRejectedValue(
    Object.assign(new Error('internal'), {
      name: 'ConditionalCheckFailedException',
    }),
  );
  await expect(
    new LicenseAdminRepository({ send }, 'licenses').revoke(license.licenseId),
  ).rejects.toBeInstanceOf(LicenseNotFoundError);
});
it('queries paginated installations only within the selected license and strips extra fields', async () => {
  const first = {
    installationId: crypto.randomUUID(),
    status: 'ACTIVE',
    activatedAt: license.createdAt,
    lastSeenAt: license.createdAt,
  };
  const second = {
    ...first,
    installationId: crypto.randomUUID(),
    status: 'REVOKED',
  };
  const cursor = {
    PK: `LICENSE#${license.licenseId}`,
    SK: `INSTALLATION#${first.installationId}`,
  };
  const send = vi
    .fn()
    .mockResolvedValueOnce({ Item: { licenseId: license.licenseId } })
    .mockResolvedValueOnce({
      Items: [{ ...first, jwt: 'secret' }],
      LastEvaluatedKey: cursor,
    })
    .mockResolvedValueOnce({ Items: [second] });
  expect(
    await collect(
      new LicenseAdminRepository({ send }, 'licenses').installations(
        license.licenseId,
      ),
    ),
  ).toEqual([first, second]);
  expect(send.mock.calls[0][0]).toBeInstanceOf(GetCommand);
  expect(send.mock.calls[1][0]).toBeInstanceOf(QueryCommand);
  expect(send.mock.calls[1][0].input).toMatchObject({
    TableName: 'licenses',
    ConsistentRead: true,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `LICENSE#${license.licenseId}`,
      ':prefix': 'INSTALLATION#',
    },
  });
  expect(send.mock.calls[2][0].input.ExclusiveStartKey).toEqual(cursor);
});
it('distinguishes an existing license with no installations from a missing license', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({ Item: { licenseId: license.licenseId } })
    .mockResolvedValueOnce({});
  expect(
    await collect(
      new LicenseAdminRepository({ send }, 'licenses').installations(
        license.licenseId,
      ),
    ),
  ).toEqual([]);
  send.mockResolvedValueOnce({});
  await expect(
    collect(
      new LicenseAdminRepository({ send }, 'licenses').installations(
        license.licenseId,
      ),
    ),
  ).rejects.toBeInstanceOf(LicenseNotFoundError);
  expect(send).toHaveBeenCalledTimes(3);
});
