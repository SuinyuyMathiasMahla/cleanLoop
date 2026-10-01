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
exports.ApiStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
class ApiStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, userPool, reportsHandler, tasksHandler, crewHandler, notificationsHandler, } = props;
        // ── REST API ──────────────────────────────────────────────────────────────
        const api = new apigateway.RestApi(this, 'CleanLoopApi', {
            restApiName: `cleanloop-api-${stage}`,
            deployOptions: { stageName: stage },
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: [
                    'Content-Type',
                    'X-Amz-Date',
                    'Authorization',
                    'X-Api-Key',
                    'X-Amz-Security-Token',
                ],
            },
        });
        // ── CORS on API Gateway-level error responses (4xx / 5xx) ────────────────
        api.addGatewayResponse('Default4xx', {
            type: apigateway.ResponseType.DEFAULT_4XX,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'*'",
                'Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
            },
        });
        api.addGatewayResponse('Default5xx', {
            type: apigateway.ResponseType.DEFAULT_5XX,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'*'",
                'Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
            },
        });
        // ── Cognito Authorizer ────────────────────────────────────────────────────
        const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
            cognitoUserPools: [userPool],
            authorizerName: `cleanloop-authorizer-${stage}`,
            identitySource: 'method.request.header.Authorization',
        });
        const authOptions = {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        };
        const publicOptions = {
            authorizationType: apigateway.AuthorizationType.NONE,
        };
        // ── Integration helpers ───────────────────────────────────────────────────
        const reportsInt = new apigateway.LambdaIntegration(reportsHandler);
        const tasksInt = new apigateway.LambdaIntegration(tasksHandler);
        const crewInt = new apigateway.LambdaIntegration(crewHandler);
        const notifInt = new apigateway.LambdaIntegration(notificationsHandler);
        // ── /reports ──────────────────────────────────────────────────────────────
        const reports = api.root.addResource('reports');
        reports.addMethod('POST', reportsInt, authOptions);
        reports.addMethod('GET', reportsInt, authOptions);
        // /reports/guest — unauthenticated submit
        const reportsGuest = reports.addResource('guest');
        reportsGuest.addMethod('POST', reportsInt, publicOptions);
        // /reports/public — public feed
        const reportsPublic = reports.addResource('public');
        reportsPublic.addMethod('GET', reportsInt, publicOptions);
        const reportsPublicAuthenticated = reportsPublic.addResource('authenticated');
        reportsPublicAuthenticated.addMethod('GET', reportsInt, authOptions);
        // /reports/mine — signed-in citizen's own reports
        const reportsMine = reports.addResource('mine');
        reportsMine.addMethod('GET', reportsInt, authOptions);
        // /reports/presigned-upload
        const presignedUpload = reports.addResource('presigned-upload');
        presignedUpload.addMethod('GET', reportsInt, publicOptions);
        // /reports/{reportId}
        const reportById = reports.addResource('{reportId}');
        reportById.addMethod('GET', reportsInt, authOptions);
        reportById.addMethod('PATCH', reportsInt, authOptions);
        reportById.addMethod('DELETE', reportsInt, authOptions);
        const reportLike = reportById.addResource('like');
        reportLike.addMethod('POST', reportsInt, authOptions);
        const reportComments = reportById.addResource('comments');
        reportComments.addMethod('POST', reportsInt, authOptions);
        // /reports/{reportId}/status
        const reportStatus = reportById.addResource('status');
        reportStatus.addMethod('GET', reportsInt, publicOptions);
        reportStatus.addMethod('PATCH', reportsInt, authOptions);
        // ── /tasks ────────────────────────────────────────────────────────────────
        const tasks = api.root.addResource('tasks');
        tasks.addMethod('POST', tasksInt, authOptions);
        tasks.addMethod('GET', tasksInt, authOptions);
        // /tasks/mine — crew member's assigned tasks
        const tasksMine = tasks.addResource('mine');
        tasksMine.addMethod('GET', tasksInt, authOptions);
        // /tasks/{taskId}
        const taskById = tasks.addResource('{taskId}');
        taskById.addMethod('GET', tasksInt, authOptions);
        taskById.addMethod('PATCH', tasksInt, authOptions);
        taskById.addMethod('DELETE', tasksInt, authOptions);
        // /tasks/{taskId}/status
        const taskStatus = taskById.addResource('status');
        taskStatus.addMethod('PATCH', tasksInt, authOptions);
        // /tasks/{taskId}/evidence-upload — presigned S3 PUT URL for crew photos
        const taskEvidenceUpload = taskById.addResource('evidence-upload');
        taskEvidenceUpload.addMethod('GET', tasksInt, authOptions);
        // /tasks/{taskId}/evidence-photos — presigned S3 GET URLs for stored photos
        const taskEvidencePhotos = taskById.addResource('evidence-photos');
        taskEvidencePhotos.addMethod('GET', tasksInt, authOptions);
        taskEvidencePhotos.addMethod('DELETE', tasksInt, authOptions);
        // ── /crew ─────────────────────────────────────────────────────────────────
        const crew = api.root.addResource('crew');
        crew.addMethod('POST', crewInt, authOptions);
        crew.addMethod('GET', crewInt, authOptions);
        const crewById = crew.addResource('{userId}');
        crewById.addMethod('GET', crewInt, authOptions);
        crewById.addMethod('PATCH', crewInt, authOptions);
        crewById.addMethod('DELETE', crewInt, authOptions);
        // ── /notifications ────────────────────────────────────────────────────────
        const notifications = api.root.addResource('notifications');
        notifications.addMethod('GET', notifInt, authOptions);
        notifications.addMethod('POST', notifInt, authOptions);
        // /notifications/send
        const notifSend = notifications.addResource('send');
        notifSend.addMethod('POST', notifInt, authOptions);
        // /notifications/read-all
        const notifReadAll = notifications.addResource('read-all');
        notifReadAll.addMethod('POST', notifInt, authOptions);
        // /notifications/{notificationId}
        const notifById = notifications.addResource('{notificationId}');
        notifById.addMethod('DELETE', notifInt, authOptions);
        // /notifications/{notificationId}/read
        const notifRead = notifById.addResource('read');
        notifRead.addMethod('PATCH', notifInt, authOptions);
        // ── /profile ──────────────────────────────────────────────────────────────
        const profile = api.root.addResource('profile');
        profile.addMethod('GET', reportsInt, authOptions);
        profile.addMethod('PATCH', reportsInt, authOptions);
        // ── Outputs ───────────────────────────────────────────────────────────────
        this.apiUrl = api.url;
        new cdk.CfnOutput(this, 'ApiUrlOutput', {
            value: api.url,
            description: 'CleanLoop REST API URL',
        });
    }
}
exports.ApiStack = ApiStack;
