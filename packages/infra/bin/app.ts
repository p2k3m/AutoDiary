#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { EdgeStack } from '../lib/edge-stack.js';
import { AppStack } from '../lib/app-stack.js';
import { WeeklyReviewStack } from '../lib/weekly-review-stack.js';

const app = new App();
const domain = app.node.tryGetContext('domain') || 'example.com';
const hostedZoneId = app.node.tryGetContext('hostedZoneId') || 'Z2ABCDEFG';
const hostedZoneName = app.node.tryGetContext('hostedZoneName');

const edge = new EdgeStack(app, 'EdgeStack', { domain });

const appStack = new AppStack(app, 'AppStack', {
  domain,
  hostedZoneId,
  certArn: edge.certArn,
  hostedZoneName,
});

const enableWeeklyLambda =
  app.node.tryGetContext('enableWeeklyLambda') === 'true' ||
  process.env.ENABLE_WEEKLY_LAMBDA === 'true';

if (enableWeeklyLambda) {
  const weekly = new WeeklyReviewStack(app, 'WeeklyReviewStack', {
    bucket: appStack.userBucket,
  });
  weekly.addDependency(appStack);
}
