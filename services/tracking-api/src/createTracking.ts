import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { createAuthorization } from './authorization.js';
import { createSigningKeyProvider } from './secrets.js';
import { readTrackingConfig } from './trackingConfig.js';
import { createTrackingHandler } from './trackingHandler.js';
import { DynamoTrackingRepository } from './trackingRepository.js';
import { TrackingService } from './trackingService.js';

let service: TrackingService | undefined;
const authorize = createAuthorization(async () => {
  const config = readTrackingConfig(process.env);
  return createSigningKeyProvider(
    new SecretsManagerClient({}),
    config.JWT_SECRET_ARN,
  )();
});

export const handler = createTrackingHandler(
  authorize,
  async (identity, input) => {
    if (!service) {
      const config = readTrackingConfig(process.env);
      service = new TrackingService(
        new DynamoTrackingRepository(
          DynamoDBDocumentClient.from(new DynamoDBClient({})),
          config.TRACKING_TABLE_NAME,
        ),
        config.TRACKING_BASE_URL,
      );
    }
    return service.create(identity, input);
  },
);
