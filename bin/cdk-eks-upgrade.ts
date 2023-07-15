#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkEksUpgradeStack } from '../lib/cdk-eks-upgrade-stack';

const app = new cdk.App();
new CdkEksUpgradeStack(app, 'CdkEksUpgradeStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION 
  },
});