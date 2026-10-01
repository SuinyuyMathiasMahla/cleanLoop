import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
export interface StorageStackProps extends cdk.StackProps {
    stage: string;
}
export declare class StorageStack extends cdk.Stack {
    readonly reportsTable: dynamodb.Table;
    readonly usersTable: dynamodb.Table;
    readonly tasksTable: dynamodb.Table;
    readonly notificationsTable: dynamodb.Table;
    readonly mediaBucket: s3.Bucket;
    constructor(scope: Construct, id: string, props: StorageStackProps);
}
