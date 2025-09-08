#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { EdgeStack } from '../lib/edge-stack.js';
import { AppStack } from '../lib/app-stack.js';
import { WeeklyReviewStack } from '../lib/weekly-review-stack.js';

const app = new App();
const domain = app.node.tryGetContext('domain');
const hostedZoneId = app.node.tryGetContext('hostedZoneId');
const hostedZoneName = app.node.tryGetContext('hostedZoneName');

let certArn: string | undefined;
if (domain) {
  const edge = new EdgeStack(app, 'EdgeStack', { domain });
  certArn = edge.certArn;
}

const appStack = new AppStack(app, 'AppStack', {
  domain,
  hostedZoneId,
  certArn,
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
