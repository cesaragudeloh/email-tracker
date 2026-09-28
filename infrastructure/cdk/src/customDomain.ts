import { CfnOutput, CfnParameter, type Stack } from 'aws-cdk-lib';
import {
  Certificate,
  CertificateValidation,
} from 'aws-cdk-lib/aws-certificatemanager';
import {
  ApiMapping,
  DomainName,
  type HttpApi,
  IpAddressType,
  SecurityPolicy,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { ApiGatewayv2DomainProperties } from 'aws-cdk-lib/aws-route53-targets';

export const TRACKING_DOMAIN = 'tracking.cesaragudelo.com';
export const TRACKING_BASE_URL = `https://${TRACKING_DOMAIN}`;
const ZONE_NAME = 'cesaragudelo.com';

export interface CustomDomainConfig {
  hostedZoneId?: string;
}

export function readCustomDomainConfig(
  env: NodeJS.ProcessEnv,
): CustomDomainConfig | undefined {
  const enabled = env.ENABLE_CUSTOM_DOMAIN;
  if (enabled !== undefined && enabled !== 'true' && enabled !== 'false')
    throw new Error('ENABLE_CUSTOM_DOMAIN must be true or false');
  if (env.HOSTED_ZONE_ID && enabled !== 'true')
    throw new Error('HOSTED_ZONE_ID requires ENABLE_CUSTOM_DOMAIN=true');
  if (enabled !== 'true') return undefined;
  const config = { hostedZoneId: env.HOSTED_ZONE_ID };
  validateCustomDomainConfig(config);
  return config;
}

export function validateCustomDomainConfig(config: CustomDomainConfig): void {
  if (
    config.hostedZoneId !== undefined &&
    !/^Z[A-Z0-9]+$/.test(config.hostedZoneId)
  )
    throw new Error(
      'HOSTED_ZONE_ID must be a Route53 zone ID without /hostedzone/',
    );
}

export function configureCustomDomain(
  stack: Stack,
  api: HttpApi,
  config: CustomDomainConfig,
): void {
  validateCustomDomainConfig(config);
  const hostedZoneId =
    config.hostedZoneId ??
    new CfnParameter(stack, 'HostedZoneId', {
      type: 'String',
      description:
        'Existing public Route53 hosted zone ID for cesaragudelo.com (same AWS account).',
      allowedPattern: '^Z[A-Z0-9]+$',
      constraintDescription:
        'Provide the existing Route53 zone ID without /hostedzone/.',
    }).valueAsString;
  const zone = HostedZone.fromHostedZoneAttributes(
    stack,
    'ExistingTrackingZone',
    {
      hostedZoneId,
      zoneName: ZONE_NAME,
    },
  );
  const certificate = new Certificate(stack, 'TrackingCertificate', {
    domainName: TRACKING_DOMAIN,
    validation: CertificateValidation.fromDns(zone),
  });
  const domain = new DomainName(stack, 'TrackingCustomDomain', {
    domainName: TRACKING_DOMAIN,
    certificate,
    securityPolicy: SecurityPolicy.TLS_1_2,
    ipAddressType: IpAddressType.IPV4,
  });
  new ApiMapping(stack, 'TrackingApiMapping', { api, domainName: domain });
  new ARecord(stack, 'TrackingAlias', {
    zone,
    recordName: TRACKING_DOMAIN,
    target: RecordTarget.fromAlias(
      new ApiGatewayv2DomainProperties(
        domain.regionalDomainName,
        domain.regionalHostedZoneId,
      ),
    ),
  });
  new CfnOutput(stack, 'TrackingDomain', { value: TRACKING_BASE_URL });
  new CfnOutput(stack, 'ApiCustomDomain', { value: TRACKING_DOMAIN });
}
