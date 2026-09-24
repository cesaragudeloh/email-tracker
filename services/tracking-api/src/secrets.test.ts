import { describe, expect, it, vi } from 'vitest';
import {
  GetSecretValueCommand,
  type SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { createSigningKeyProvider } from './secrets.js';

describe('Secrets Manager (mocked SDK)', () => {
  it('retrieves the configured secret and extracts its key', async () => {
    const signingKey = 'fake-key-for-tests-at-least-32-characters';
    const send = vi
      .fn()
      .mockResolvedValue({ SecretString: JSON.stringify({ signingKey }) });
    const provider = createSigningKeyProvider(
      { send } as unknown as SecretsManagerClient,
      'test-arn',
    );
    expect(await provider()).toEqual(new TextEncoder().encode(signingKey));
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetSecretValueCommand);
    expect(send.mock.calls[0][0].input).toEqual({ SecretId: 'test-arn' });
  });
  it.each([undefined, '{}', '{', '{"signingKey":"short"}'])(
    'rejects malformed or missing secrets',
    async (SecretString) => {
      const send = vi.fn().mockResolvedValue({ SecretString });
      await expect(
        createSigningKeyProvider(
          { send } as unknown as SecretsManagerClient,
          'test',
        )(),
      ).rejects.toThrow();
    },
  );
  it('propagates AWS failure without a fallback secret', async () => {
    const send = vi.fn().mockRejectedValue(new Error('denied'));
    await expect(
      createSigningKeyProvider(
        { send } as unknown as SecretsManagerClient,
        'test',
      )(),
    ).rejects.toThrow('denied');
  });
});
