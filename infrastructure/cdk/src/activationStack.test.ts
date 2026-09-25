import { beforeAll, expect, it } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Code } from 'aws-cdk-lib/aws-lambda';
import { ActivationStack } from './activationStack.js';

let result: Template;
beforeAll(() => {
  result = Template.fromStack(
    new ActivationStack(new App(), 'TestActivation', {
      lambdaCode: Code.fromInline('exports.handler = async () => ({});'),
    }),
  );
}, 60000);
it('creates activation and tracking routes with separate Lambdas', () => {
  result.resourceCountIs('AWS::Lambda::Function', 3);
  result.resourceCountIs('AWS::ApiGatewayV2::Route', 3);
  result.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'POST /api/activate',
  });
  result.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs22.x',
    Environment: { Variables: Match.objectLike({ JWT_TTL_SECONDS: '86400' }) },
  });
});
it('retains the keyed on-demand table and generates the signing secret', () => {
  result.resourceCountIs('AWS::DynamoDB::Table', 2);
  result.hasResourceProperties('AWS::DynamoDB::Table', {
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
  });
  result.hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain' });
  result.hasResourceProperties('AWS::SecretsManager::Secret', {
    GenerateSecretString: Match.objectLike({
      GenerateStringKey: 'signingKey',
      PasswordLength: 64,
    }),
  });
});
it('grants only specific DynamoDB actions and secret reads on concrete resources', () => {
  const policies = result.findResources('AWS::IAM::Policy');
  const text = JSON.stringify(policies);
  expect(text).not.toContain('dynamodb:Scan');
  expect(text).not.toContain('dynamodb:*');
  expect(text).not.toContain('secretsmanager:*');
  expect(text).not.toContain('"Resource":"*"');
  expect(text).toContain('dynamodb:ConditionCheckItem');
  expect(text).toContain('secretsmanager:GetSecretValue');
});
it('validates the configurable JWT duration before creating a stack', () => {
  expect(
    () => new ActivationStack(new App(), 'Invalid', { jwtTtlSeconds: 0 }),
  ).toThrow('Invalid JWT TTL');
});

it('scopes tracking DynamoDB access to PutItem on its dedicated table', () => {
  result.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'POST /api/tracking',
  });
  const tables = result.findResources('AWS::DynamoDB::Table');
  const tableId = Object.keys(tables).find((id) =>
    id.startsWith('EmailTracking'),
  )!;
  const policies = result.findResources('AWS::IAM::Policy');
  const policyId = Object.keys(policies).find((id) =>
    id.startsWith('CreateTrackingRole'),
  )!;
  const statements = policies[policyId].Properties.PolicyDocument.Statement;
  expect(
    statements.filter((statement: { Action: string | string[] }) =>
      JSON.stringify(statement.Action).includes('dynamodb:'),
    ),
  ).toEqual([
    {
      Action: 'dynamodb:PutItem',
      Effect: 'Allow',
      Resource: { 'Fn::GetAtt': [tableId, 'Arn'] },
    },
  ]);
  result.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'createTracking.handler',
    Environment: {
      Variables: Match.objectLike({ TRACKING_TABLE_NAME: { Ref: tableId } }),
    },
  });
});

it('creates a public pixel route with a dedicated Lambda and no secret environment', () => {
  result.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'GET /o/{trackingId}',
    AuthorizationType: 'NONE',
  });
  const tables = result.findResources('AWS::DynamoDB::Table');
  const tableId = Object.keys(tables).find((id) =>
    id.startsWith('EmailTracking'),
  )!;
  result.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'openTrackingPixel.handler',
    Environment: { Variables: { TRACKING_TABLE_NAME: { Ref: tableId } } },
  });
});
it('grants pixel only GetItem/PutItem on EmailTracking and log writes', () => {
  const tables = result.findResources('AWS::DynamoDB::Table');
  const tableId = Object.keys(tables).find((id) =>
    id.startsWith('EmailTracking'),
  )!;
  const policies = result.findResources('AWS::IAM::Policy');
  const policyId = Object.keys(policies).find((id) =>
    id.startsWith('OpenTrackingRole'),
  )!;
  const statements = policies[policyId].Properties.PolicyDocument.Statement;
  expect(statements).toHaveLength(2);
  expect(statements[0].Action).toEqual([
    'logs:CreateLogStream',
    'logs:PutLogEvents',
  ]);
  expect(statements[1]).toEqual({
    Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
    Effect: 'Allow',
    Resource: { 'Fn::GetAtt': [tableId, 'Arn'] },
  });
});
