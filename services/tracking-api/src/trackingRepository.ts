import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { TrackingRecord } from './tracking.js';

export interface TrackingRepository {
  create(record: TrackingRecord): Promise<void>;
}

export class DynamoTrackingRepository implements TrackingRepository {
  constructor(
    private readonly client: Pick<DynamoDBDocumentClient, 'send'>,
    private readonly tableName: string,
  ) {}

  async create(record: TrackingRecord): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `TRACKING#${record.trackingId}`,
          SK: 'EMAIL',
          trackingId: record.trackingId,
          recipient: record.recipient,
          subject: record.subject,
          createdAt: record.createdAt,
          licenseId: record.licenseId,
          installationId: record.installationId,
          status: record.status,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  }
}
