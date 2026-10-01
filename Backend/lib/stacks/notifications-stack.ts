import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';

export interface NotificationsStackProps extends cdk.StackProps {
  stage: string;
}

export class NotificationsStack extends cdk.Stack {
  public readonly eventBus: events.EventBus;

  constructor(scope: Construct, id: string, props: NotificationsStackProps) {
    super(scope, id, props);

    const { stage } = props;

    // Custom EventBridge bus for CleanLoop events
    this.eventBus = new events.EventBus(this, 'CleanLoopEventBus', {
      eventBusName: `cleanloop-events-${stage}`,
    });

    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      description: 'CleanLoop EventBridge bus name',
    });

    new cdk.CfnOutput(this, 'EventBusArn', {
      value: this.eventBus.eventBusArn,
      description: 'CleanLoop EventBridge bus ARN',
    });
  }
}
