import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
export interface ApiStackProps extends cdk.StackProps {
    stage: string;
    userPool: cognito.UserPool;
    userPoolClient: cognito.UserPoolClient;
    reportsHandler: lambda.Function;
    tasksHandler: lambda.Function;
    crewHandler: lambda.Function;
    notificationsHandler: lambda.Function;
}
export declare class ApiStack extends cdk.Stack {
    readonly apiUrl: string;
    constructor(scope: Construct, id: string, props: ApiStackProps);
}
