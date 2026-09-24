import {
  GetSecretValueCommand,
  type SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { z } from 'zod';

const secretSchema = z.object({ signingKey: z.string().min(32) });

export function createSigningKeyProvider(
  client: Pick<SecretsManagerClient, 'send'>,
  secretId: string,
) {
  // No se guarda el secreto en variables de entorno ni en logs.
  return async (): Promise<Uint8Array> => {
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretId }),
    );
    const secret: unknown = JSON.parse(response.SecretString ?? '{}');
    return new TextEncoder().encode(secretSchema.parse(secret).signingKey);
  };
}
