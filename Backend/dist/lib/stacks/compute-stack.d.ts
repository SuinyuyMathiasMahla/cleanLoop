import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
export interface ComputeStackProps extends cdk.StackProps {
    stage: string;
    reportsTable: dynamodb.Table;
    usersTable: dynamodb.Table;
    tasksTable: dynamodb.Table;
    notificationsTable: dynamodb.Table;
    mediaBucket: s3.Bucket;
    userPool: cognito.UserPool;
    sesFromEmail: string;
    googleMapsApiKey: string;
}
export declare class ComputeStack extends cdk.Stack {
    readonly reportsHandler: lambda.Function;
    readonly tasksHandler: lambda.Function;
    readonly crewHandler: lambda.Function;
    readonly notificationsHandler: lambda.Function;
    constructor(scope: Construct, id: string, props: ComputeStackProps);
}
