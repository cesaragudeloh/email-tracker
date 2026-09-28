import { App } from 'aws-cdk-lib';
import { ActivationStack } from './activationStack.js';
import { readCustomDomainConfig } from './customDomain.js';

const app = new App();
new ActivationStack(app, 'EmailTrackerActivation', {
  customDomain: readCustomDomainConfig(process.env),
  trackingBaseUrl: process.env.TRACKING_BASE_URL,
  jwtTtlSeconds: Number(app.node.tryGetContext('jwtTtlSeconds') ?? 86400),
});
