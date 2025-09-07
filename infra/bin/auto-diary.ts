#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { EdgeStack } from '../lib/edge-stack.js';
import { AppStack } from '../lib/app-stack.js';

const app = new App();
const domain = app.node.tryGetContext('domain') || 'example.com';
const hostedZoneId = app.node.tryGetContext('hostedZoneId') || 'Z2ABCDEFG';

const edge = new EdgeStack(app, 'EdgeStack', { domain });

new AppStack(app, 'AppStack', {
  domain,
  hostedZoneId,
  certArn: edge.certArn,
});
