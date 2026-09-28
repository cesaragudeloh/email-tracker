import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { createLicense, licenseItems } from './license.js';
import { LicenseAdminRepository } from './licenseAdminRepository.js';
import { LicenseCliError, licenseCliError } from './licenseCliErrors.js';

type Command = 'create' | 'list' | 'revoke' | 'installations';

function parseOptions(args: string[]) {
  const command =
    args[0]?.startsWith('--') || args.length === 0 ? 'create' : args[0];
  if (!['create', 'list', 'revoke', 'installations'].includes(command!))
    throw new LicenseCliError(
      'Expected create, list, revoke or installations.',
    );
  const parsedCommand = command as Command;
  let values;
  try {
    ({ values } = parseArgs({
      args: command === args[0] ? args.slice(1) : args,
      strict: true,
      allowPositionals: false,
      options: {
        table: { type: 'string' },
        region: { type: 'string' },
        'max-devices': { type: 'string' },
        'expires-at': { type: 'string' },
        'license-id': { type: 'string' },
        write: { type: 'boolean' },
      },
    }));
    const allowed: Record<Command, string[]> = {
      create: ['table', 'region', 'max-devices', 'expires-at', 'write'],
      list: ['table', 'region'],
      revoke: ['table', 'region', 'license-id', 'write'],
      installations: ['table', 'region', 'license-id'],
    };
    if (
      Object.keys(values).some((key) => !allowed[parsedCommand].includes(key))
    )
      throw new Error('Unsupported option');
  } catch {
    throw new LicenseCliError(
      'Invalid arguments. Use --table and optional --region; create accepts --max-devices/--expires-at/--write, revoke accepts --license-id/--write, installations requires --license-id.',
    );
  }
  const { table, region } = values;
  if ((parsedCommand !== 'create' || values.write) && !table)
    throw new LicenseCliError(
      '--table is required for this command (and create --write).',
    );
  if (table !== undefined && !/^[A-Za-z0-9_.-]{3,255}$/.test(table))
    throw new LicenseCliError(
      '--table must be a valid DynamoDB table name (3–255 characters).',
    );
  if (region !== undefined && !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region))
    throw new LicenseCliError('--region must be an AWS region name.');
  const licenseId = values['license-id'];
  if (
    ['revoke', 'installations'].includes(parsedCommand) &&
    (!licenseId?.startsWith('lic_') ||
      !z.uuid().safeParse(licenseId.slice(4)).success)
  )
    throw new LicenseCliError(
      '--license-id must have the generated format lic_<UUID>.',
    );
  return { command: parsedCommand, ...values };
}

async function execute(args: string[], output: (text: string) => void) {
  const options = parseOptions(args);
  if (options.command === 'create') {
    const expiresAt =
      options['expires-at'] === undefined
        ? undefined
        : Math.floor(Date.parse(options['expires-at']) / 1000);
    let prepared;
    try {
      prepared = createLicense(
        Number(options['max-devices'] ?? '1'),
        expiresAt,
      );
    } catch {
      throw new LicenseCliError(
        'Invalid license options. --max-devices must be a positive integer; --expires-at must be a future date.',
      );
    }
    const { license, activationCode } = prepared;
    const items = licenseItems(license);
    if (options.write) {
      const client = DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: options.region }),
      );
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: items.map((Item) => ({
              Put: {
                TableName: options.table,
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
      `${options.write ? 'License created' : 'License prepared (not stored)'}\n\nLicense ID:\n${license.licenseId}\n\nActivation code (shown only once; do not redirect this output to a file):\n${activationCode}\n\nMax devices:\n${license.maxDevices}\n\nDynamoDB items (hash only):\n${JSON.stringify(items, null, 2)}`,
    );
    return;
  }
  if (options.command === 'revoke' && !options.write) {
    output(
      `Dry-run: would set license ${options['license-id']} status to REVOKED in table ${options.table}. No AWS request made; existence not checked. Use --write to apply. Issued JWTs remain valid until expiration.`,
    );
    return;
  }
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: options.region }),
  );
  const repository = new LicenseAdminRepository(client, options.table!);
  try {
    if (options.command === 'revoke') {
      const license = await repository.revoke(options['license-id']!);
      output(JSON.stringify(license));
      output('License is REVOKED. Issued JWTs remain valid until expiration.');
    } else {
      const records =
        options.command === 'list'
          ? repository.list()
          : repository.installations(options['license-id']!);
      let count = 0;
      for await (const record of records) {
        output(JSON.stringify(record));
        count++;
      }
      output(
        `Complete: ${count} ${options.command === 'list' ? 'licenses' : 'installations'}.`,
      );
    }
  } finally {
    client.destroy();
  }
}

export async function runLicenseCli(
  args: string[],
  output: (text: string) => void = console.info,
) {
  try {
    await execute(args, output);
  } catch (error) {
    throw licenseCliError(error);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runLicenseCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(licenseCliError(error).message);
    process.exitCode = 1;
  });
}
