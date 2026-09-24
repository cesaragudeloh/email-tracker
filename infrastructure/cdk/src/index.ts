import { App } from 'aws-cdk-lib';
import { ActivationStack } from './activationStack.js';

const app = new App();
new ActivationStack(app, 'EmailTrackerActivation', {
  jwtTtlSeconds: Number(app.node.tryGetContext('jwtTtlSeconds') ?? 86400),
});
