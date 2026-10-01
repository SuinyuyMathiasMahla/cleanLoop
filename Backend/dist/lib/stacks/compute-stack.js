"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComputeStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const lambdaNodejs = __importStar(require("aws-cdk-lib/aws-lambda-nodejs"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
const path = __importStar(require("path"));
class ComputeStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, reportsTable, usersTable, tasksTable, notificationsTable, mediaBucket, userPool, sesFromEmail, googleMapsApiKey, } = props;
        const commonEnv = {
            REPORTS_TABLE: reportsTable.tableName,
            USERS_TABLE: usersTable.tableName,
            CREW_TABLE: usersTable.tableName,
            TASKS_TABLE: tasksTable.tableName,
            NOTIFICATIONS_TABLE: notificationsTable.tableName,
            MEDIA_BUCKET: mediaBucket.bucketName,
            USER_POOL_ID: userPool.userPoolId,
            SES_FROM_EMAIL: sesFromEmail,
            STAGE: stage,
            GOOGLE_MAPS_API_KEY: googleMapsApiKey,
            MAX_AUTO_ASSIGN_DISTANCE_KM: process.env.MAX_AUTO_ASSIGN_DISTANCE_KM ?? '25',
        };
        const bundling = {
            minify: false,
            sourceMap: false,
            externalModules: ['aws-sdk', '@aws-sdk/*'],
        };
        const lambdaDir = path.join(__dirname, '../../lambda');
        // -- Reports Handler -------------------------------------------------------
        this.reportsHandler = new lambdaNodejs.NodejsFunction(this, 'ReportsHandler', {
            functionName: `cleanloop-reports-${stage}`,
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: path.join(lambdaDir, 'reports/handler.ts'),
            handler: 'handler',
            bundling,
            environment: commonEnv,
            timeout: cdk.Duration.seconds(29),
            memorySize: 256,
        });
        reportsTable.grantReadWriteData(this.reportsHandler);
        usersTable.grantReadWriteData(this.reportsHandler);
        tasksTable.grantReadWriteData(this.reportsHandler);
        notificationsTable.grantWriteData(this.reportsHandler);
        mediaBucket.grantPut(this.reportsHandler);
        mediaBucket.grantRead(this.reportsHandler);
        mediaBucket.grantDelete(this.reportsHandler);
        this.reportsHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: ['events:PutEvents'],
            resources: ['*'],
        }));
        new events.Rule(this, 'PendingReportAutoAssignmentRule', {
            ruleName: `cleanloop-pending-report-assignment-${stage}`,
            schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
            targets: [new targets.LambdaFunction(this.reportsHandler)],
        });
        // -- Tasks Handler ---------------------------------------------------------
        this.tasksHandler = new lambdaNodejs.NodejsFunction(this, 'TasksHandler', {
            functionName: `cleanloop-tasks-${stage}`,
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: path.join(lambdaDir, 'tasks/handler.ts'),
            handler: 'handler',
            bundling,
            environment: commonEnv,
            timeout: cdk.Duration.seconds(29),
            memorySize: 256,
        });
        tasksTable.grantReadWriteData(this.tasksHandler);
        reportsTable.grantReadWriteData(this.tasksHandler);
        usersTable.grantReadData(this.tasksHandler);
        mediaBucket.grantPut(this.tasksHandler);
        mediaBucket.grantRead(this.tasksHandler);
        mediaBucket.grantDelete(this.tasksHandler);
        this.tasksHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail', 'ses:SendRawEmail'],
            resources: ['*'],
        }));
        // -- Crew Handler ----------------------------------------------------------
        this.crewHandler = new lambdaNodejs.NodejsFunction(this, 'CrewHandler', {
            functionName: `cleanloop-crew-${stage}`,
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: path.join(lambdaDir, 'crew/handler.ts'),
            handler: 'handler',
            bundling,
            environment: commonEnv,
            timeout: cdk.Duration.seconds(29),
            memorySize: 256,
        });
        usersTable.grantReadWriteData(this.crewHandler);
        this.crewHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'cognito-idp:AdminCreateUser',
                'cognito-idp:AdminAddUserToGroup',
                'cognito-idp:AdminRemoveUserFromGroup',
                'cognito-idp:AdminDeleteUser',
                'cognito-idp:AdminGetUser',
                'cognito-idp:AdminSetUserPassword',
                'cognito-idp:ListUsers',
                'cognito-idp:ListUsersInGroup',
                'cognito-idp:GetGroup',
                'cognito-idp:CreateGroup',
            ],
            resources: [userPool.userPoolArn],
        }));
        // -- Notifications Handler -------------------------------------------------
        this.notificationsHandler = new lambdaNodejs.NodejsFunction(this, 'NotificationsHandler', {
            functionName: `cleanloop-notifications-${stage}`,
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: path.join(lambdaDir, 'notifications/handler.ts'),
            handler: 'handler',
            bundling,
            environment: commonEnv,
            timeout: cdk.Duration.seconds(29),
            memorySize: 256,
        });
        notificationsTable.grantReadWriteData(this.notificationsHandler);
        usersTable.grantReadData(this.notificationsHandler);
        // -- Email Reminder Handler (Scheduled) ------------------------------------
        const emailReminderHandler = new lambdaNodejs.NodejsFunction(this, 'EmailReminderHandler', {
            functionName: `cleanloop-email-reminder-${stage}`,
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: path.join(lambdaDir, 'email-reminder/handler.ts'),
            handler: 'handler',
            bundling,
            environment: commonEnv,
            timeout: cdk.Duration.seconds(60),
            memorySize: 256,
        });
        tasksTable.grantReadWriteData(emailReminderHandler);
        usersTable.grantReadData(emailReminderHandler);
        notificationsTable.grantWriteData(emailReminderHandler);
        emailReminderHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail', 'ses:SendRawEmail'],
            resources: ['*'],
        }));
        new events.Rule(this, 'EmailReminderRule', {
            ruleName: `cleanloop-email-reminder-${stage}`,
            schedule: events.Schedule.rate(cdk.Duration.minutes(30)),
            targets: [new targets.LambdaFunction(emailReminderHandler)],
        });
    }
}
exports.ComputeStack = ComputeStack;
