import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
export interface NotificationsStackProps extends cdk.StackProps {
    stage: string;
}
export declare class NotificationsStack extends cdk.Stack {
    readonly eventBus: events.EventBus;
    constructor(scope: Construct, id: string, props: NotificationsStackProps);
}
