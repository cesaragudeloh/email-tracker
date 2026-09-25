import { App } from 'aws-cdk-lib';
import { ActivationStack } from './activationStack.js';

const app = new App();
new ActivationStack(app, 'EmailTrackerActivation', {
  trackingBaseUrl: process.env.TRACKING_BASE_URL,
  jwtTtlSeconds: Number(app.node.tryGetContext('jwtTtlSeconds') ?? 86400),
});
