import { Linking } from 'react-native';

const COGNITO_REGION = process.env.EXPO_PUBLIC_COGNITO_REGION ?? 'ap-southeast-2';
const COGNITO_URL = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
const CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ?? '';
const COGNITO_DOMAIN = process.env.EXPO_PUBLIC_COGNITO_DOMAIN ?? 'cleanloop-dev';

async function cognitoRequest(target: string, body: Record<string, unknown>) {
  const response = await fetch(COGNITO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorCode = data.__type ?? data.code ?? 'UnknownError';
    const errorMessage = data.message ?? data.Message ?? 'An error occurred';
    throw new CognitoError(errorCode, errorMessage);
  }

  return data;
}

export class CognitoError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CognitoError';
  }
}

export function getCognitoErrorMessage(error: unknown): string {
  if (error instanceof CognitoError) {
    switch (error.code) {
      case 'UserNotFoundException':
        return 'No account found with this email.';
      case 'NotAuthorizedException':
        return 'Incorrect email or password.';
      case 'UsernameExistsException':
        return 'An account with this email already exists.';
      case 'CodeMismatchException':
        return 'Invalid verification code. Please try again.';
      case 'ExpiredCodeException':
        return 'Verification code has expired. Please request a new one.';
      case 'LimitExceededException':
        return 'Too many attempts. Please try again later.';
      case 'InvalidPasswordException':
        return 'Password does not meet requirements.';
      case 'InvalidParameterException':
        return error.message;
      case 'NewPasswordRequired':
        return 'Your account requires a password reset. Please contact your administrator.';
      case 'UserNotConfirmedException':
        return 'Your account has not been verified. Please check your email for a confirmation code.';
      case 'PasswordResetRequiredException':
        return 'A password reset is required. Please contact your administrator.';
      case 'NetworkError':
        return 'Unable to connect. Please check your internet connection and try again.';
      default:
        return error.message || 'Something went wrong. Please try again.';
    }
  }
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes('network') ||
        error.message.toLowerCase().includes('fetch')) {
      return 'Unable to connect. Please check your internet connection and try again.';
    }
    return 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

export async function signUp(
  email: string,
  password: string,
  name: string,
  phone: string
): Promise<void> {
  await cognitoRequest('SignUp', {
    ClientId: CLIENT_ID,
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'name', Value: name },
      { Name: 'phone_number', Value: phone },
    ],
  });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await cognitoRequest('ConfirmSignUp', {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
  });
}

export async function resendConfirmationCode(email: string): Promise<void> {
  await cognitoRequest('ResendConfirmationCode', {
    ClientId: CLIENT_ID,
    Username: email,
  });
}

export async function signIn(email: string, password: string): Promise<CognitoTokens> {
  const data = await cognitoRequest('InitiateAuth', {
    ClientId: CLIENT_ID,
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  });

  // Crew accounts created via AdminCreateUser require a password change on first login
  if (data.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    throw new CognitoError(
      'NewPasswordRequired',
      'Your account requires a password reset. Please contact your administrator.'
    );
  }

  const result = data.AuthenticationResult;
  if (!result) {
    throw new CognitoError('UnknownError', 'Sign in failed. Please try again.');
  }

  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
  };
}

export async function refreshTokens(refreshToken: string): Promise<CognitoTokens> {
  const data = await cognitoRequest('InitiateAuth', {
    ClientId: CLIENT_ID,
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
    },
  });

  const result = data.AuthenticationResult;
  if (!result) {
    throw new CognitoError('UnknownError', 'Session refresh failed. Please log in again.');
  }

  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken ?? refreshToken,
  };
}

export async function signOut(accessToken: string): Promise<void> {
  await cognitoRequest('GlobalSignOut', {
    AccessToken: accessToken,
  });
}

export async function forgotPassword(email: string): Promise<void> {
  await cognitoRequest('ForgotPassword', {
    ClientId: CLIENT_ID,
    Username: email,
  });
}

export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  await cognitoRequest('ConfirmForgotPassword', {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
  });
}

export async function googleSignIn(): Promise<CognitoTokens> {
  if (!CLIENT_ID || !COGNITO_DOMAIN) {
    throw new CognitoError('ConfigurationError', 'Google sign-in is not configured for this build.');
  }
  const redirectUri = 'cleanloop://auth/callback';
  const state = createOAuthState();
  const authorizeUrl = new URL(`https://${COGNITO_DOMAIN}.auth.${COGNITO_REGION}.amazoncognito.com/oauth2/authorize`);
  authorizeUrl.search = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    identity_provider: 'Google',
    redirect_uri: redirectUri,
    state,
  }).toString();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      subscription.remove();
      reject(new CognitoError('OAuthTimeout', 'Google sign-in was not completed. Please try again.'));
    }, 180000);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (!url.startsWith(redirectUri)) return;
      subscription.remove();
      clearTimeout(timeout);
      const callbackUrl = new URL(url);
      if (callbackUrl.searchParams.get('state') !== state) {
        reject(new CognitoError('OAuthStateMismatch', 'Google sign-in could not be verified.'));
        return;
      }
      const error = callbackUrl.searchParams.get('error');
      const code = callbackUrl.searchParams.get('code');
      if (error || !code) {
        reject(new CognitoError(error ?? 'OAuthError', callbackUrl.searchParams.get('error_description') ?? 'Google sign-in was cancelled.'));
        return;
      }
      void exchangeAuthorizationCode(code, redirectUri).then(resolve, reject);
    });
    Linking.openURL(authorizeUrl.toString()).catch(error => {
      subscription.remove();
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function createOAuthState(): string {
  const values = new Uint8Array(24);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return Array.from(values, value => value.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now()}-${Math.random()}-${Math.random()}`;
}

async function exchangeAuthorizationCode(code: string, redirectUri: string): Promise<CognitoTokens> {
  const response = await fetch(`https://${COGNITO_DOMAIN}.auth.${COGNITO_REGION}.amazoncognito.com/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });
  const data = await response.json();
  if (!response.ok || !(data.id_token ?? data.IdToken) || !(data.access_token ?? data.AccessToken)) {
    throw new CognitoError(data.error ?? 'OAuthTokenExchangeFailed', data.error_description ?? 'Could not complete Google sign-in.');
  }
  return { idToken: data.id_token ?? data.IdToken, accessToken: data.access_token ?? data.AccessToken, refreshToken: data.refresh_token ?? data.RefreshToken ?? '' };
}

export function parseJwt(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return {};
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = parseJwt(token);
  const exp = payload.exp as number | undefined;
  if (!exp) return true;
  return Date.now() >= exp * 1000;
}