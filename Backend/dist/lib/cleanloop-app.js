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
exports.CleanLoopApp = void 0;
const dotenv = __importStar(require("dotenv"));
const constructs_1 = require("constructs");
const auth_stack_1 = require("./stacks/auth-stack");
const storage_stack_1 = require("./stacks/storage-stack");
const compute_stack_1 = require("./stacks/compute-stack");
const api_stack_1 = require("./stacks/api-stack");
const notifications_stack_1 = require("./stacks/notifications-stack");
dotenv.config();
class CleanLoopApp extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { stage } = props;
        const storageStack = new storage_stack_1.StorageStack(scope, `CleanLoop-Storage-${stage}`, {
            ...props,
        });
        const authStack = new auth_stack_1.AuthStack(scope, `CleanLoop-Auth-${stage}`, {
            usersTable: storageStack.usersTable,
            ...props,
        });
        new notifications_stack_1.NotificationsStack(scope, `CleanLoop-Notifications-${stage}`, {
            ...props,
        });
        const computeStack = new compute_stack_1.ComputeStack(scope, `CleanLoop-Compute-${stage}`, {
            reportsTable: storageStack.reportsTable,
            usersTable: storageStack.usersTable,
            tasksTable: storageStack.tasksTable,
            notificationsTable: storageStack.notificationsTable,
            mediaBucket: storageStack.mediaBucket,
            userPool: authStack.userPool,
            sesFromEmail: process.env.SES_FROM_EMAIL ?? `noreply@cleanloop-${stage}.example.com`,
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
            ...props,
        });
        new api_stack_1.ApiStack(scope, `CleanLoop-Api-${stage}`, {
            userPool: authStack.userPool,
            userPoolClient: authStack.userPoolClient,
            reportsHandler: computeStack.reportsHandler,
            tasksHandler: computeStack.tasksHandler,
            crewHandler: computeStack.crewHandler,
            notificationsHandler: computeStack.notificationsHandler,
            ...props,
        });
    }
}
exports.CleanLoopApp = CleanLoopApp;
