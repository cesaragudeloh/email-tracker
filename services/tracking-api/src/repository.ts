import {
  GetCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { ConcurrentActivationError } from './errors.js';
import {
  installationSchema,
  licenseSchema,
  type Installation,
  type License,
} from './license.js';

export interface LicenseRepository {
  findByHash(hash: string): Promise<License | undefined>;
  findInstallation(
    licenseId: string,
    installationId: string,
  ): Promise<Installation | undefined>;
  register(
    license: License,
    installationId: string,
    existing: boolean,
    now: number,
  ): Promise<void>;
}

export class DynamoLicenseRepository implements LicenseRepository {
  constructor(
    private readonly client: Pick<DynamoDBDocumentClient, 'send'>,
    private readonly tableName: string,
  ) {}

  private async get(PK: string, SK: string) {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK, SK },
        ConsistentRead: true,
      }),
    );
    return response.Item;
  }

  async findByHash(hash: string): Promise<License | undefined> {
    const lookup = await this.get(`CODE#${hash}`, 'LOOKUP');
    if (!lookup) return undefined;
    const { licenseId } = z
      .object({ licenseId: z.string().min(1) })
      .parse(lookup);
    const item = await this.get(`LICENSE#${licenseId}`, 'LICENSE');
    if (!item) return undefined;
    const license = licenseSchema.parse(item);
    return license.activationCodeHash === hash ? license : undefined;
  }

  async findInstallation(
    licenseId: string,
    installationId: string,
  ): Promise<Installation | undefined> {
    const item = await this.get(
      `LICENSE#${licenseId}`,
      `INSTALLATION#${installationId}`,
    );
    return item ? installationSchema.parse(item) : undefined;
  }

  async register(
    license: License,
    installationId: string,
    existing: boolean,
    now: number,
  ): Promise<void> {
    const PK = `LICENSE#${license.licenseId}`;
    const timestamp = new Date(now * 1000).toISOString();
    const licenseCondition = {
      TableName: this.tableName,
      Key: { PK, SK: 'LICENSE' },
      ConditionExpression:
        '#status = :active AND activationCodeHash = :hash AND (attribute_not_exists(expiresAt) OR expiresAt > :now) AND ' +
        (license.expiresAt === undefined
          ? 'attribute_not_exists(expiresAt)'
          : 'expiresAt = :expectedExpiration'),
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':active': 'ACTIVE',
        ':hash': license.activationCodeHash,
        ':now': now,
        ...(license.expiresAt === undefined
          ? {}
          : { ':expectedExpiration': license.expiresAt }),
      },
    };
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: existing
            ? [
                { ConditionCheck: licenseCondition },
                {
                  Update: {
                    TableName: this.tableName,
                    Key: { PK, SK: `INSTALLATION#${installationId}` },
                    UpdateExpression: 'SET lastSeenAt = :timestamp',
                    ConditionExpression: '#status = :active',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                      ':active': 'ACTIVE',
                      ':timestamp': timestamp,
                    },
                  },
                },
              ]
            : [
                {
                  Update: {
                    ...licenseCondition,
                    ConditionExpression: `${licenseCondition.ConditionExpression} AND activeDevices < maxDevices`,
                    UpdateExpression:
                      'SET activeDevices = activeDevices + :one',
                    ExpressionAttributeValues: {
                      ...licenseCondition.ExpressionAttributeValues,
                      ':one': 1,
                    },
                  },
                },
                {
                  Put: {
                    TableName: this.tableName,
                    Item: {
                      PK,
                      SK: `INSTALLATION#${installationId}`,
                      installationId,
                      status: 'ACTIVE',
                      activatedAt: timestamp,
                      lastSeenAt: timestamp,
                    },
                    ConditionExpression: 'attribute_not_exists(PK)',
                  },
                },
              ],
        }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TransactionCanceledException' ||
          error.name === 'TransactionConflictException')
      ) {
        throw new ConcurrentActivationError();
      }
      throw error;
    }
  }
}
