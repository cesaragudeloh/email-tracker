import {
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import {
  installationSchema,
  licenseSchema,
  type Installation,
} from './license.js';

// Allowlist output fields even if DynamoDB or a mock returns extra attributes.
export const licenseSummarySchema = licenseSchema.pick({
  licenseId: true,
  status: true,
  maxDevices: true,
  activeDevices: true,
  createdAt: true,
  expiresAt: true,
});
export type LicenseSummary = z.infer<typeof licenseSummarySchema>;

export class LicenseNotFoundError extends Error {
  constructor() {
    super('License not found in the selected table.');
  }
}

const projection =
  'licenseId, #status, maxDevices, activeDevices, createdAt, expiresAt';

export class LicenseAdminRepository {
  constructor(
    private readonly client: Pick<DynamoDBDocumentClient, 'send'>,
    private readonly tableName: string,
  ) {}

  async *list(): AsyncGenerator<LicenseSummary> {
    let cursor: Record<string, unknown> | undefined;
    do {
      // Administrative only: no all-licenses partition/GSI in the MVP schema.
      // Filtering reduces returned data, not read capacity. Never used by Lambdas.
      const page = await this.client.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'SK = :license AND begins_with(PK, :prefix)',
          ExpressionAttributeValues: {
            ':license': 'LICENSE',
            ':prefix': 'LICENSE#',
          },
          ProjectionExpression: projection,
          ExpressionAttributeNames: { '#status': 'status' },
          Limit: 100,
          ExclusiveStartKey: cursor,
        }),
      );
      for (const item of page.Items ?? [])
        yield licenseSummarySchema.parse(item);
      cursor = page.LastEvaluatedKey;
    } while (cursor && Object.keys(cursor).length > 0);
  }

  async revoke(licenseId: string): Promise<LicenseSummary> {
    try {
      const result = await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: `LICENSE#${licenseId}`, SK: 'LICENSE' },
          UpdateExpression: 'SET #status = :revoked',
          ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':revoked': 'REVOKED' },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return licenseSummarySchema.parse(result.Attributes);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
      )
        throw new LicenseNotFoundError();
      throw error;
    }
  }

  async *installations(licenseId: string): AsyncGenerator<Installation> {
    const PK = `LICENSE#${licenseId}`;
    const license = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK, SK: 'LICENSE' },
        ProjectionExpression: 'licenseId',
        ConsistentRead: true,
      }),
    );
    if (!license.Item) throw new LicenseNotFoundError();
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': PK, ':prefix': 'INSTALLATION#' },
          ProjectionExpression:
            'installationId, #status, activatedAt, lastSeenAt',
          ExpressionAttributeNames: { '#status': 'status' },
          ConsistentRead: true,
          Limit: 100,
          ExclusiveStartKey: cursor,
        }),
      );
      for (const item of page.Items ?? []) yield installationSchema.parse(item);
      cursor = page.LastEvaluatedKey;
    } while (cursor && Object.keys(cursor).length > 0);
  }
}
