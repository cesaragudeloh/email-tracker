import {
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { TrackingRecord } from './tracking.js';
import type { TrackingOpenEvent } from './openTracking.js';
import { z } from 'zod';
import {
  createTrackingRequestSchema,
  trackingStatusSchema,
} from '@email-tracker/shared';

const trackingRecordSchema = createTrackingRequestSchema
  .extend({
    trackingId: z.uuid(),
    createdAt: z.iso.datetime(),
    licenseId: z.string().min(1),
    installationId: z.uuid(),
    status: trackingStatusSchema,
  })
  .strip();

export interface TrackingRepository {
  create(record: TrackingRecord): Promise<void>;
  getTracking(trackingId: string): Promise<TrackingRecord | undefined>;
  createOpenEvent(event: TrackingOpenEvent): Promise<void>;
}

export class DynamoTrackingRepository implements TrackingRepository {
  constructor(
    private readonly client: Pick<DynamoDBDocumentClient, 'send'>,
    private readonly tableName: string,
  ) {}

  async getTracking(trackingId: string): Promise<TrackingRecord | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `TRACKING#${trackingId}`, SK: 'EMAIL' },
        ConsistentRead: true,
      }),
    );
    if (!result.Item) return undefined;
    const record = trackingRecordSchema.parse(result.Item);
    if (record.trackingId !== trackingId)
      throw new Error('Invalid tracking record');
    return record;
  }

  async createOpenEvent(event: TrackingOpenEvent): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `TRACKING#${event.trackingId}`,
          SK: `OPEN#${event.openedAt}#${event.eventId}`,
          trackingId: event.trackingId,
          eventId: event.eventId,
          eventType: event.eventType,
          openedAt: event.openedAt,
          ip: event.ip,
          userAgent: event.userAgent,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  }

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
