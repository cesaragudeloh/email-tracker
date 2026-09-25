import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { createAuthorization } from './authorization.js';
import { createSigningKeyProvider } from './secrets.js';
import { readTrackingConfig } from './trackingConfig.js';
import { createGetTrackingHandler } from './getTrackingHandler.js';
import { DynamoTrackingRepository } from './trackingRepository.js';
import { GetTrackingService } from './getTrackingService.js';

let service: GetTrackingService | undefined;
const authorize = createAuthorization(async () => {
  const config = readTrackingConfig(process.env);
  return createSigningKeyProvider(
    new SecretsManagerClient({}),
    config.JWT_SECRET_ARN,
  )();
});

export const handler = createGetTrackingHandler(
  authorize,
  async (identity, input) => {
    if (!service) {
      const config = readTrackingConfig(process.env);
      service = new GetTrackingService(
        new DynamoTrackingRepository(
          DynamoDBDocumentClient.from(new DynamoDBClient({})),
          config.TRACKING_TABLE_NAME,
        ),
      );
    }
    return service.get(identity, input);
  },
);
