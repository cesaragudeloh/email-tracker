import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { createLicense, licenseItems } from './license.js';

export async function runLicenseCli(
  args: string[],
  output: (text: string) => void = console.info,
) {
  const { values } = parseArgs({
    args,
    options: {
      'max-devices': { type: 'string', default: '1' },
      'expires-at': { type: 'string' },
      table: { type: 'string' },
      write: { type: 'boolean', default: false },
    },
  });
  if (values.write && !values.table)
    throw new Error('--table is required with --write');
  const expiresAt =
    values['expires-at'] === undefined
      ? undefined
      : Math.floor(Date.parse(values['expires-at']) / 1000);
  const { license, activationCode } = createLicense(
    Number(values['max-devices']),
    expiresAt,
  );
  const items = licenseItems(license);
  if (values.write) {
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    try {
      await client.send(
        new TransactWriteCommand({
          TransactItems: items.map((Item) => ({
            Put: {
              TableName: values.table,
              Item,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          })),
        }),
      );
    } finally {
      client.destroy();
    }
  }
  output(
    `${values.write ? 'License created' : 'License prepared (not stored)'}\n\nLicense ID:\n${license.licenseId}\n\nActivation code (shown only once; do not redirect this output to a file):\n${activationCode}\n\nMax devices:\n${license.maxDevices}\n\nDynamoDB items (hash only):\n${JSON.stringify(items, null, 2)}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runLicenseCli(process.argv.slice(2)).catch(() => {
    console.error(
      'License creation failed. Check arguments, AWS credentials and table access.',
    );
    process.exitCode = 1;
  });
}
