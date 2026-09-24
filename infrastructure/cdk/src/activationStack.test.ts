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
it('creates only the activation route and one Lambda', () => {
  result.resourceCountIs('AWS::Lambda::Function', 1);
  result.resourceCountIs('AWS::ApiGatewayV2::Route', 1);
  result.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'POST /api/activate',
  });
  result.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs22.x',
    Environment: { Variables: Match.objectLike({ JWT_TTL_SECONDS: '86400' }) },
  });
});
it('retains the keyed on-demand table and generates the signing secret', () => {
  result.resourceCountIs('AWS::DynamoDB::Table', 1);
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
