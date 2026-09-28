import { expect, it } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Code } from 'aws-cdk-lib/aws-lambda';
import { ActivationStack } from './activationStack.js';
import { readCustomDomainConfig, TRACKING_BASE_URL } from './customDomain.js';

const lambdaCode = Code.fromInline('exports.handler = async () => ({});');

it('synthesizes the regional HTTPS domain without lookups or a fabricated zone ID', () => {
  const app = new App({ context: { 'aws:cdk:enable-lookups': false } });
  const stack = new ActivationStack(app, 'DomainTest', {
    lambdaCode,
    customDomain: {},
  });
  const template = Template.fromStack(stack);
  const resourceId = (type: string) =>
    Object.keys(template.findResources(type))[0]!;
  const certificateId = resourceId('AWS::CertificateManager::Certificate');
  const domainId = resourceId('AWS::ApiGatewayV2::DomainName');
  const apiId = resourceId('AWS::ApiGatewayV2::Api');
  const stageId = resourceId('AWS::ApiGatewayV2::Stage');
  template.hasParameter('HostedZoneId', {
    Type: 'String',
    AllowedPattern: '^Z[A-Z0-9]+$',
    Default: Match.absent(),
  });
  template.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: 'tracking.cesaragudelo.com',
    ValidationMethod: 'DNS',
    DomainValidationOptions: [
      {
        DomainName: 'tracking.cesaragudelo.com',
        HostedZoneId: { Ref: 'HostedZoneId' },
      },
    ],
    SubjectAlternativeNames: Match.absent(),
  });
  template.hasResourceProperties('AWS::ApiGatewayV2::DomainName', {
    DomainName: 'tracking.cesaragudelo.com',
    DomainNameConfigurations: [
      {
        CertificateArn: { Ref: certificateId },
        EndpointType: 'REGIONAL',
        SecurityPolicy: 'TLS_1_2',
        IpAddressType: 'ipv4',
      },
    ],
  });
  template.hasResourceProperties('AWS::ApiGatewayV2::ApiMapping', {
    ApiId: { Ref: apiId },
    DomainName: { Ref: domainId },
    Stage: '$default',
    ApiMappingKey: Match.absent(),
  });
  template.hasResource('AWS::ApiGatewayV2::ApiMapping', {
    DependsOn: Match.arrayWith([stageId]),
  });
  template.resourceCountIs('AWS::ApiGatewayV2::Stage', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
    StageName: '$default',
  });
  template.hasResourceProperties('AWS::Route53::RecordSet', {
    Name: 'tracking.cesaragudelo.com.',
    Type: 'A',
    HostedZoneId: { Ref: 'HostedZoneId' },
    AliasTarget: {
      DNSName: { 'Fn::GetAtt': [domainId, 'RegionalDomainName'] },
      HostedZoneId: { 'Fn::GetAtt': [domainId, 'RegionalHostedZoneId'] },
    },
  });
  template.resourceCountIs('AWS::Route53::RecordSet', 1);
  template.resourceCountIs('AWS::Route53::HostedZone', 0);
  template.resourceCountIs('AWS::CloudFront::Distribution', 0);
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    ProtocolType: 'HTTP',
    DisableExecuteApiEndpoint: Match.absent(),
    CorsConfiguration: Match.absent(),
  });
  for (const handler of ['createTracking.handler', 'getTracking.handler']) {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: handler,
      Environment: {
        Variables: Match.objectLike({
          TRACKING_BASE_URL,
          JWT_SECRET_ARN: Match.anyValue(),
        }),
      },
    });
    const functions = template.findResources('AWS::Lambda::Function');
    const functionId = Object.keys(functions).find(
      (id) => functions[id].Properties.Handler === handler,
    )!;
    const integrations = template.findResources(
      'AWS::ApiGatewayV2::Integration',
    );
    const integrationId = Object.keys(integrations).find((id) =>
      JSON.stringify(integrations[id]).includes(functionId),
    )!;
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey:
        handler === 'createTracking.handler'
          ? 'POST /api/tracking'
          : 'GET /api/tracking/{trackingId}',
      Target: { 'Fn::Join': ['', ['integrations/', { Ref: integrationId }]] },
    });
  }
  template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'GET /o/{trackingId}',
    AuthorizationType: 'NONE',
  });
  template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'POST /api/activate',
    AuthorizationType: 'NONE',
  });
  template.hasOutput('TrackingDomain', { Value: TRACKING_BASE_URL });
  template.hasOutput('ApiCustomDomain', { Value: 'tracking.cesaragudelo.com' });
  expect(app.synth().manifest.missing ?? []).toEqual([]);
}, 60000);

it('allows local operation without domain resources and with a tracking URL override', () => {
  const template = Template.fromStack(
    new ActivationStack(new App(), 'Local', {
      lambdaCode,
      trackingBaseUrl: 'http://localhost:3000/',
    }),
  );
  for (const type of [
    'AWS::CertificateManager::Certificate',
    'AWS::ApiGatewayV2::DomainName',
    'AWS::ApiGatewayV2::ApiMapping',
    'AWS::Route53::RecordSet',
  ])
    template.resourceCountIs(type, 0);
  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'createTracking.handler',
    Environment: {
      Variables: Match.objectLike({
        TRACKING_BASE_URL: 'http://localhost:3000',
      }),
    },
  });
});

it('accepts an explicit zone ID (test fixture only) without creating a parameter', () => {
  const template = Template.fromStack(
    new ActivationStack(new App(), 'Explicit', {
      lambdaCode,
      customDomain: { hostedZoneId: 'ZTESTFIXTURE' },
    }),
  );
  expect(template.toJSON().Parameters?.HostedZoneId).toBeUndefined();
  template.hasResourceProperties('AWS::Route53::RecordSet', {
    HostedZoneId: 'ZTESTFIXTURE',
  });
});

it('rejects a conflicting production tracking URL', () => {
  expect(
    () =>
      new ActivationStack(new App(), 'Conflict', {
        lambdaCode,
        customDomain: {},
        trackingBaseUrl: 'https://api.example.test',
      }),
  ).toThrow('Custom domain requires');
});
it('defaults to disabled and enables a deployment parameter when no zone ID is known', () => {
  expect(readCustomDomainConfig({})).toBeUndefined();
  expect(
    readCustomDomainConfig({ ENABLE_CUSTOM_DOMAIN: 'false' }),
  ).toBeUndefined();
  expect(readCustomDomainConfig({ ENABLE_CUSTOM_DOMAIN: 'true' })).toEqual({
    hostedZoneId: undefined,
  });
});
it.each(['', '/hostedzone/Z123', 'example', 'Z WITH SPACE'])(
  'rejects invalid zone ID %s',
  (hostedZoneId) => {
    expect(() =>
      readCustomDomainConfig({
        ENABLE_CUSTOM_DOMAIN: 'true',
        HOSTED_ZONE_ID: hostedZoneId,
      }),
    ).toThrow('HOSTED_ZONE_ID');
  },
);
it('rejects ambiguous enablement', () => {
  expect(() => readCustomDomainConfig({ ENABLE_CUSTOM_DOMAIN: 'yes' })).toThrow(
    'ENABLE_CUSTOM_DOMAIN',
  );
  expect(() =>
    readCustomDomainConfig({ HOSTED_ZONE_ID: 'ZTESTFIXTURE' }),
  ).toThrow('requires');
});
