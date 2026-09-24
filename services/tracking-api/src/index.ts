import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { createHandler } from './handler.js';
import { createActivationService } from './activationService.js';
import { readConfig } from './config.js';
import { DynamoLicenseRepository } from './repository.js';
import { createSigningKeyProvider } from './secrets.js';

// La inicialización también queda dentro del manejo de errores del handler.
let activate: ReturnType<typeof createActivationService> | undefined;
export const handler = createHandler(async (request) => {
  if (!activate) {
    const config = readConfig(process.env);
    activate = createActivationService({
      repository: new DynamoLicenseRepository(
        DynamoDBDocumentClient.from(new DynamoDBClient({})),
        config.LICENSE_TABLE_NAME,
      ),
      signingKey: createSigningKeyProvider(
        new SecretsManagerClient({}),
        config.JWT_SECRET_ARN,
      ),
      ttlSeconds: config.JWT_TTL_SECONDS,
    });
  }
  return activate(request);
});
