import { fileURLToPath } from 'node:url';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { HttpApi, HttpMethod, CfnStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Construct } from 'constructs';

interface ActivationStackProps extends StackProps {
  jwtTtlSeconds?: number;
  lambdaCode?: Code;
  trackingBaseUrl?: string;
}

export class ActivationStack extends Stack {
  constructor(scope: Construct, id: string, props: ActivationStackProps = {}) {
    super(scope, id, props);
    const ttl = props.jwtTtlSeconds ?? 86400;
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 86400)
      throw new Error('Invalid JWT TTL');
    const table = new Table(this, 'ExtensionLicenses', {
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const secret = new Secret(this, 'JwtSigningSecret', {
      generateSecretString: {
        secretStringTemplate: '{}',
        generateStringKey: 'signingKey',
        passwordLength: 64,
        excludePunctuation: true,
      },
    });
    secret.applyRemovalPolicy(RemovalPolicy.RETAIN);
    const logs = new LogGroup(this, 'ActivationLogs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const role = new Role(this, 'ActivationRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    logs.grantWrite(role);
    role.addToPolicy(
      new PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:ConditionCheckItem',
        ],
        resources: [table.tableArn],
      }),
    );
    role.addToPolicy(
      new PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [secret.secretArn],
      }),
    );
    const activate = new Function(this, 'ActivationFunction', {
      runtime: Runtime.NODEJS_22_X,
      code:
        props.lambdaCode ??
        Code.fromAsset(
          fileURLToPath(
            new URL(
              '../../../services/tracking-api/build/lambda/',
              import.meta.url,
            ),
          ),
        ),
      handler: 'index.handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      role,
      logGroup: logs,
      environment: {
        LICENSE_TABLE_NAME: table.tableName,
        JWT_SECRET_ARN: secret.secretArn,
        JWT_TTL_SECONDS: String(ttl),
      },
    });
    const api = new HttpApi(this, 'ActivationApi', {
      apiName: 'Email Tracker Activation',
    });
    api.addRoutes({
      path: '/api/activate',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('Activate', activate),
    });
    const trackingTable = new Table(this, 'EmailTracking', {
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const trackingLogs = new LogGroup(this, 'CreateTrackingLogs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const trackingRole = new Role(this, 'CreateTrackingRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    trackingLogs.grantWrite(trackingRole);
    trackingRole.addToPolicy(
      new PolicyStatement({
        actions: ['dynamodb:PutItem'],
        resources: [trackingTable.tableArn],
      }),
    );
    trackingRole.addToPolicy(
      new PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [secret.secretArn],
      }),
    );
    const createTracking = new Function(this, 'CreateTrackingFunction', {
      runtime: Runtime.NODEJS_22_X,
      code:
        props.lambdaCode ??
        Code.fromAsset(
          fileURLToPath(
            new URL(
              '../../../services/tracking-api/build/lambda/',
              import.meta.url,
            ),
          ),
        ),
      handler: 'createTracking.handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      role: trackingRole,
      logGroup: trackingLogs,
      environment: {
        TRACKING_TABLE_NAME: trackingTable.tableName,
        JWT_SECRET_ARN: secret.secretArn,
        ...(props.trackingBaseUrl
          ? { TRACKING_BASE_URL: props.trackingBaseUrl }
          : {}),
      },
    });
    api.addRoutes({
      path: '/api/tracking',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateTracking', createTracking),
    });
    const pixelLogs = new LogGroup(this, 'OpenTrackingLogs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const pixelRole = new Role(this, 'OpenTrackingRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    pixelLogs.grantWrite(pixelRole);
    pixelRole.addToPolicy(
      new PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
        resources: [trackingTable.tableArn],
      }),
    );
    const pixel = new Function(this, 'OpenTrackingFunction', {
      runtime: Runtime.NODEJS_22_X,
      code:
        props.lambdaCode ??
        Code.fromAsset(
          fileURLToPath(
            new URL(
              '../../../services/tracking-api/build/lambda/',
              import.meta.url,
            ),
          ),
        ),
      handler: 'openTrackingPixel.handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      role: pixelRole,
      logGroup: pixelLogs,
      environment: { TRACKING_TABLE_NAME: trackingTable.tableName },
    });
    api.addRoutes({
      path: '/o/{trackingId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('OpenTracking', pixel),
    });
    new CfnOutput(this, 'TrackingTableName', {
      value: trackingTable.tableName,
    });
    const stage = api.defaultStage?.node.defaultChild;
    if (stage instanceof CfnStage)
      stage.defaultRouteSettings = {
        throttlingRateLimit: 5,
        throttlingBurstLimit: 10,
      };
    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'LicenseTableName', { value: table.tableName });
  }
}
