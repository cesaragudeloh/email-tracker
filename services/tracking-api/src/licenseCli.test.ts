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
    DynamoDBDocumentClient: { from: () => ({ send, destroy }) },
  };
});
import { runLicenseCli } from './licenseCli.js';

beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue({});
});
it('prepares hash-only records without contacting AWS by default', async () => {
  const output = vi.fn();
  await runLicenseCli(['--max-devices', '2'], output);
  expect(send).not.toHaveBeenCalled();
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
