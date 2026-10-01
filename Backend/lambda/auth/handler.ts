import {
  PostConfirmationTriggerEvent,
  PreTokenGenerationTriggerEvent,
  CustomMessageTriggerEvent,
} from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { dbGet, dbPut, dbUpdate } from '../shared/dynamo';

const cognito = new CognitoIdentityProviderClient({});
const USERS_TABLE = process.env.USERS_TABLE!;

// ── PostConfirmation ──────────────────────────────────────────────────────────
async function postConfirmation(event: PostConfirmationTriggerEvent) {
  const { userPoolId, userName } = event;
  const { email, name, phone_number, sub } = event.request.userAttributes;

  // IMPORTANT: Always use `sub` (the stable UUID) as userId — NOT userName.
  // userName may be a phone number or email depending on Cognito config.
  // getCaller() in shared/auth.ts also uses sub, so they must match.
  const userId = sub ?? userName;
  const now = new Date().toISOString();

  await dbPut({
    TableName: USERS_TABLE,
    Item: {
      userId,
      email: email ?? '',
      name: name ?? email?.split('@')[0] ?? '',
      phone: phone_number ?? '',
      role: 'CITIZEN',
      cognitoSub: sub ?? userName,
      createdAt: now,
      pushToken: null,
    },
    ConditionExpression: 'attribute_not_exists(userId)',
  }).catch(() => {
    // User record may already exist (e.g., social login re-confirm)
  });

  // Add user to CITIZEN group
  try {
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: userName,
      GroupName: 'CITIZEN',
    }));
  } catch (err: unknown) {
    console.error('Failed to add user to CITIZEN group:', err);
  }

  return event;
}

// ── PreTokenGeneration ────────────────────────────────────────────────────────
async function preTokenGeneration(event: PreTokenGenerationTriggerEvent) {
  // Use sub (stable UUID) — same key getCaller() uses — so DynamoDB lookups match
  const userId = event.request.userAttributes.sub ?? event.userName;

  let role = 'CITIZEN';
  let user: Record<string, unknown> | undefined;
  try {
    user = await dbGet({ TableName: USERS_TABLE, Key: { userId } }) as Record<string, unknown> | undefined;
    if (user?.role) role = user.role as string;
  } catch (err) {
    console.error('Failed to fetch user for token generation:', err);
  }

  if (!user) {
    const now = new Date().toISOString();
    await dbPut({
      TableName: USERS_TABLE,
      Item: {
        userId,
        cognitoSub: userId,
        email: event.request.userAttributes.email ?? '',
        name: event.request.userAttributes.name ?? event.request.userAttributes.email?.split('@')[0] ?? '',
        role: 'CITIZEN',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(userId)',
    }).catch(err => console.warn('Could not create federated user profile:', err));
  }

  // Cognito group membership is the source of truth — override DynamoDB if needed
  const groups: string[] =
    (event.request as any).groupConfiguration?.groupsToOverride ?? [];

  if (groups.includes('ADMIN')) {
    role = 'ADMIN';
  } else if (groups.includes('CREW')) {
    role = 'CREW';
  }

  // Sync DynamoDB so it stays consistent with Cognito groups
  if (role !== 'CITIZEN') {
    try {
      await dbUpdate({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: 'SET #r = :r',
        ExpressionAttributeNames: { '#r': 'role' },
        ExpressionAttributeValues: { ':r': role },
      });
    } catch (err) {
      console.warn('Could not sync role to DynamoDB:', err);
    }
  }

  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: {
        'custom:role': role,
      },
    },
  };

  return event;
}

// ── CustomMessage ─────────────────────────────────────────────────────────────
async function customMessage(event: CustomMessageTriggerEvent) {
  if (event.triggerSource === 'CustomMessage_SignUp') {
    const code = event.request.codeParameter;
    event.response.emailSubject = 'Welcome to CleanLoop – Verify your email';
    event.response.emailMessage = `
      <h2>Welcome to CleanLoop!</h2>
      <p>Thanks for registering. Please verify your email address using the code below:</p>
      <h3 style="color:#2e7d32;letter-spacing:8px">${code}</h3>
      <p>This code expires in 24 hours.</p>
      <p>The CleanLoop Team</p>
    `;
  } else if (event.triggerSource === 'CustomMessage_ForgotPassword') {
    const code = event.request.codeParameter;
    event.response.emailSubject = 'CleanLoop – Reset your password';
    event.response.emailMessage = `
      <h2>Reset Your Password</h2>
      <p>Use the code below to reset your CleanLoop password:</p>
      <h3 style="color:#2e7d32;letter-spacing:8px">${code}</h3>
      <p>If you didn't request this, please ignore this email.</p>
      <p>The CleanLoop Team</p>
    `;
  }
  return event;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
export async function handler(
  event:
    | PostConfirmationTriggerEvent
    | PreTokenGenerationTriggerEvent
    | CustomMessageTriggerEvent
) {
  console.log('Auth trigger:', event.triggerSource);

  switch (event.triggerSource) {
    case 'PostConfirmation_ConfirmSignUp':
    case 'PostConfirmation_ConfirmForgotPassword':
      return postConfirmation(event as PostConfirmationTriggerEvent);

    case 'TokenGeneration_Authentication':
    case 'TokenGeneration_RefreshTokens':
    case 'TokenGeneration_HostedAuth':
    case 'TokenGeneration_AuthenticateDevice':
    case 'TokenGeneration_NewPasswordChallenge':
      return preTokenGeneration(event as PreTokenGenerationTriggerEvent);

    case 'CustomMessage_SignUp':
    case 'CustomMessage_ForgotPassword':
    case 'CustomMessage_ResendCode':
      return customMessage(event as CustomMessageTriggerEvent);

    default:
      console.log('Unhandled trigger source:', event.triggerSource);
      return event;
  }
}