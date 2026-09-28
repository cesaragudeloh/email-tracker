import { beforeEach, expect, it, vi } from 'vitest';

const { send, destroy } = vi.hoisted(() => ({
  send: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@aws-sdk/lib-dynamodb')>();
  return {
    ...original,
    DynamoDBDocumentClient: { from: vi.fn(() => ({ send, destroy })) },
  };
});
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { runLicenseCli } from './licenseCli.js';

beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue({});
});
it('prepares hash-only records without contacting AWS by default', async () => {
  const output = vi.fn();
  await runLicenseCli(['--max-devices', '2'], output);
  expect(send).not.toHaveBeenCalled();
  expect(DynamoDBDocumentClient.from).not.toHaveBeenCalled();
  const text: string = output.mock.calls[0][0];
  const code = text.match(/[A-F0-9]{8}(?:-[A-F0-9]{8}){5}/)![0];
  expect(text.split(code)).toHaveLength(2);
  expect(text.slice(text.indexOf('DynamoDB items'))).not.toContain(code);
  expect(text).toContain('not stored');
});
it('inserts both records atomically with no plaintext when --write is explicit', async () => {
  const output = vi.fn();
  await runLicenseCli(
    ['--max-devices', '2', '--table', 'test-table', '--write'],
    output,
  );
  const transaction = send.mock.calls[0][0].input.TransactItems;
  expect(transaction).toHaveLength(2);
  expect(transaction[0].Put.TableName).toBe('test-table');
  expect(transaction[1].Put.Item).not.toHaveProperty('activationCode');
  expect(transaction[1].Put.ConditionExpression).toBe(
    'attribute_not_exists(PK)',
  );
  expect(destroy).toHaveBeenCalled();
});
it('does not print a code when insertion fails', async () => {
  send.mockRejectedValue(new Error('AWS detail'));
  const output = vi.fn();
  await expect(
    runLicenseCli(['--write', '--table', 'test'], output),
  ).rejects.toThrow();
  expect(output).not.toHaveBeenCalled();
});
it('requires table name before writing', async () => {
  await expect(runLicenseCli(['--write'], vi.fn())).rejects.toThrow();
});

const licenseId = 'lic_8a73e54e-c33f-40ca-a2dc-06626851744d';
const summary = {
  licenseId,
  status: 'ACTIVE',
  maxDevices: 2,
  activeDevices: 1,
  createdAt: '2026-09-27T00:00:00.000Z',
};

it('lists paginated licenses without hashes, activation codes or JWTs', async () => {
  const cursor = { PK: 'CODE#test', SK: 'LOOKUP' };
  send
    .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: cursor })
    .mockResolvedValueOnce({
      Items: [
        {
          ...summary,
          activationCodeHash: 'secret-hash',
          activationCode: 'secret-code',
          jwt: 'secret-token',
        },
      ],
    });
  const output = vi.fn();
  await runLicenseCli(['list', '--table', 'licenses'], output);
  expect(JSON.parse(output.mock.calls[0][0])).toEqual(summary);
  expect(output.mock.calls[1][0]).toBe('Complete: 1 licenses.');
  expect(JSON.stringify(output.mock.calls)).not.toContain('secret');
  expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual(cursor);
  expect(destroy).toHaveBeenCalledOnce();
});
it('previews revoke without any AWS call or confirmation of existence', async () => {
  const output = vi.fn();
  await runLicenseCli(
    ['revoke', '--license-id', licenseId, '--table', 'licenses'],
    output,
  );
  expect(send).not.toHaveBeenCalled();
  expect(DynamoDBDocumentClient.from).not.toHaveBeenCalled();
  expect(output.mock.calls[0][0]).toContain('Dry-run:');
  expect(output.mock.calls[0][0]).toContain('existence not checked');
});
it('revokes with --write and safely prints the resulting state', async () => {
  send.mockResolvedValue({
    Attributes: {
      ...summary,
      status: 'REVOKED',
      activationCodeHash: 'secret-hash',
      jwt: 'secret-token',
    },
  });
  const output = vi.fn();
  const args = [
    'revoke',
    '--license-id',
    licenseId,
    '--table',
    'licenses',
    '--write',
  ];
  await runLicenseCli(args, output);
  await runLicenseCli(args, output);
  expect(JSON.parse(output.mock.calls[0][0])).toEqual({
    ...summary,
    status: 'REVOKED',
  });
  expect(JSON.parse(output.mock.calls[2][0])).toEqual({
    ...summary,
    status: 'REVOKED',
  });
  expect(JSON.stringify(output.mock.calls)).not.toContain('secret');
  expect(send).toHaveBeenCalledTimes(2);
  expect(destroy).toHaveBeenCalledTimes(2);
});
it('reports nonexistent revoke and releases the client without success output', async () => {
  send.mockRejectedValue(
    Object.assign(new Error('private AWS detail'), {
      name: 'ConditionalCheckFailedException',
    }),
  );
  const output = vi.fn();
  await expect(
    runLicenseCli(
      ['revoke', '--license-id', licenseId, '--table', 'licenses', '--write'],
      output,
    ),
  ).rejects.toThrow('License not found');
  expect(output).not.toHaveBeenCalled();
  expect(destroy).toHaveBeenCalledOnce();
});
it.each([
  ['list'],
  ['installations', '--table', 'licenses'],
  ['revoke', '--table', 'licenses', '--license-id', 'invalid', '--write'],
  ['revoke', '--license-id', licenseId, '--write'],
  ['list', '--table', 'licenses', '--write'],
  ['list', '--table', 'licenses', '--region', 'invalid'],
  ['list', '--table', 'bad table'],
  ['create', '--max-devices', '0'],
  ['create', '--expires-at', 'yesterday'],
])('rejects invalid arguments before contacting AWS: %j', async (...args) => {
  await expect(runLicenseCli(args, vi.fn())).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});
it.each([
  ['CredentialsProviderError', 'authentication'],
  ['ExpiredTokenException', 'authentication'],
  ['AccessDeniedException', 'permission denied'],
  ['ResourceNotFoundException', 'Table not found'],
  ['TimeoutError', 'network'],
  ['ThrottlingException', 'throttled'],
  ['UnknownError', 'no success was confirmed'],
])('reports %s without leaking AWS messages', async (name, expected) => {
  send.mockRejectedValue(
    Object.assign(new Error('secret-token private AWS stack'), { name }),
  );
  const output = vi.fn();
  await expect(
    runLicenseCli(['list', '--table', 'licenses'], output),
  ).rejects.toThrow(expected);
  await expect(
    runLicenseCli(['list', '--table', 'licenses'], output),
  ).rejects.not.toThrow('secret-token');
  expect(output).not.toHaveBeenCalled();
  expect(destroy).toHaveBeenCalledTimes(2);
});
it('reports a network error code without exposing host details', async () => {
  send.mockRejectedValue(
    Object.assign(new Error('private host'), { code: 'ENOTFOUND' }),
  );
  await expect(
    runLicenseCli(['list', '--table', 'licenses'], vi.fn()),
  ).rejects.toThrow('network request failed');
});
it('does not claim a complete list if a later page fails', async () => {
  send
    .mockResolvedValueOnce({
      Items: [summary],
      LastEvaluatedKey: { PK: 'next', SK: 'LICENSE' },
    })
    .mockRejectedValueOnce(new Error('network detail'));
  const output = vi.fn();
  await expect(
    runLicenseCli(['list', '--table', 'licenses'], output),
  ).rejects.toThrow();
  expect(output).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(output.mock.calls)).not.toContain('Complete');
});
it('lists installation fields without tokens', async () => {
  const installation = {
    installationId: crypto.randomUUID(),
    status: 'ACTIVE',
    activatedAt: summary.createdAt,
    lastSeenAt: summary.createdAt,
  };
  send.mockResolvedValueOnce({ Item: { licenseId } }).mockResolvedValueOnce({
    Items: [{ ...installation, accessToken: 'secret-token' }],
  });
  const output = vi.fn();
  await runLicenseCli(
    ['installations', '--license-id', licenseId, '--table', 'licenses'],
    output,
  );
  expect(JSON.parse(output.mock.calls[0][0])).toEqual(installation);
  expect(JSON.stringify(output.mock.calls)).not.toContain('secret');
});
it('preserves explicit create, status, counters and one-time activation code', async () => {
  const output = vi.fn();
  await runLicenseCli(
    ['create', '--max-devices', '2', '--region', 'us-east-1'],
    output,
  );
  expect(send).not.toHaveBeenCalled();
  const text = output.mock.calls[0][0] as string;
  const items = JSON.parse(text.split('DynamoDB items (hash only):\n')[1]);
  expect(items[1]).toMatchObject({
    status: 'ACTIVE',
    maxDevices: 2,
    activeDevices: 0,
  });
  expect(items[1].createdAt).toBeDefined();
});

it('passes explicit region to the SDK while retaining default credential resolution', async () => {
  await runLicenseCli(
    ['list', '--table', 'licenses', '--region', 'eu-west-1'],
    vi.fn(),
  );
  const client = vi.mocked(DynamoDBDocumentClient.from).mock.calls[0][0];
  expect(await client.config.region()).toBe('eu-west-1');
});
