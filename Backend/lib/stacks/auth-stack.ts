import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  stage: string;
  usersTable: dynamodb.Table;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const { stage, usersTable } = props;

    const authHandler = new lambdaNodejs.NodejsFunction(this, 'AuthHandler', {
      functionName: `cleanloop-auth-${stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../lambda/auth/handler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: { minify: false, sourceMap: false, externalModules: ['aws-sdk', '@aws-sdk/*'] },
      environment: { USERS_TABLE: usersTable.tableName, STAGE: stage },
    });

    usersTable.grantReadWriteData(authHandler);
    authHandler.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cognito-idp:AdminAddUserToGroup','cognito-idp:AdminGetUser','cognito-idp:GetGroup','cognito-idp:CreateGroup'],
      resources: ['*'],
    }));

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `cleanloop-${stage}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true }, fullname: { required: false, mutable: true }, phoneNumber: { required: false, mutable: true } },
      customAttributes: { role: new cognito.StringAttribute({ mutable: true }) },
      passwordPolicy: { minLength: 8, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      lambdaTriggers: { postConfirmation: authHandler, preTokenGeneration: authHandler, customMessage: authHandler },
    });

    authHandler.addPermission('CognitoInvoke', {
      principal: new cdk.aws_iam.ServicePrincipal('cognito-idp.amazonaws.com'),
      sourceArn: this.userPool.userPoolArn,
    });

    new cognito.CfnUserPoolGroup(this, 'AdminGroup', { userPoolId: this.userPool.userPoolId, groupName: 'ADMIN', description: 'CleanLoop administrators' });
    new cognito.CfnUserPoolGroup(this, 'CitizenGroup', { userPoolId: this.userPool.userPoolId, groupName: 'CITIZEN', description: 'Registered citizens' });
    new cognito.CfnUserPoolGroup(this, 'CrewGroup', { userPoolId: this.userPool.userPoolId, groupName: 'CREW', description: 'Waste collection crew members' });

    const domain = this.userPool.addDomain('UserPoolDomain', { cognitoDomain: { domainPrefix: `cleanloop-${stage}` } });

    const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const supportedIdentityProviders: cognito.UserPoolClientIdentityProvider[] = [
      cognito.UserPoolClientIdentityProvider.COGNITO,
    ];
    if (googleClientId && googleClientSecret) {
      new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleIdentityProvider', {
        userPool: this.userPool,
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      });
      supportedIdentityProviders.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
    } else {
      console.warn('Google sign-in is disabled: set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET before deployment.');
    }

    this.userPoolClient = this.userPool.addClient('AppClient', {
      userPoolClientName: `cleanloop-app-${stage}`,
      generateSecret: false,
      authFlows: { userSrp: true, userPassword: true },
      supportedIdentityProviders,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: ['https://localhost:3000/callback', 'cleanloop://auth/callback'],
        logoutUrls: ['https://localhost:3000', 'cleanloop://auth/callback'],
      },
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      preventUserExistenceErrors: true,
    });

    new cdk.CfnOutput(this, 'UserPoolIdOutput', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientIdOutput', { value: this.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoDomainOutput', { value: domain.domainName });
  }
}
