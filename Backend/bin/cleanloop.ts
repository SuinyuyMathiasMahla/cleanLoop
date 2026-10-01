#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CleanLoopApp } from '../lib/cleanloop-app';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage') ?? process.env.STAGE ?? 'dev';
const account = process.env.AWS_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? 'us-east-1';

new CleanLoopApp(app, 'CleanLoop', {
  stage,
  env: { account, region },
});

app.synth();
