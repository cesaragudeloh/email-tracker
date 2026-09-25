import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { createOpenTrackingHandler } from './openTrackingHandler.js';
import { OpenTrackingService } from './openTrackingService.js';
import { DynamoTrackingRepository } from './trackingRepository.js';

let service: OpenTrackingService | undefined;
export const handler = createOpenTrackingHandler(
  async (trackingId, metadata, requestId) => {
    if (!service) {
      const tableName = z
        .string()
        .min(1)
        .parse(process.env.TRACKING_TABLE_NAME);
      service = new OpenTrackingService(
        new DynamoTrackingRepository(
          // One attempt per operation, bounded below the Lambda deadline so write
          // timeouts can still produce the pixel. No background/unawaited writes.
          DynamoDBDocumentClient.from(
            new DynamoDBClient({
              maxAttempts: 1,
              requestHandler: {
                connectionTimeout: 500,
                requestTimeout: 1500,
                throwOnRequestTimeout: true,
              },
            }),
          ),
          tableName,
        ),
      );
    }
    return service.open(trackingId, metadata, requestId);
  },
);
