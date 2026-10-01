import { create } from 'zustand';
import { adminSignIn, parseJwt } from '../services/cognito';

export interface AdminUser {
  userId: string;
  email: string;
  name: string;
  role: 'ADMIN';
}

interface AuthState {
  user: AdminUser | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loadStoredAuth: () => void;
  clearError: () => void;
}

const TOKEN_KEYS = {
  ID: 'cl_id_token',
  ACCESS: 'cl_access_token',
  REFRESH: 'cl_refresh_token',
};

function mapCognitoError(message: string): string {
  if (message.includes('NotAuthorizedException') || message.toLowerCase().includes('incorrect')) {
    return 'Incorrect email or password';
  }
  if (message.includes('UserNotFoundException') || message.includes('User does not exist')) {
    return 'No account found with this email';
  }
  if (message.includes('UserNotConfirmedException')) {
    return 'Account not confirmed. Please check your email.';
  }
  if (message.includes('PasswordResetRequiredException')) {
    return 'Password reset required. Please check your email.';
  }
  if (message.includes('TooManyRequestsException')) {
    return 'Too many attempts. Please try again later.';
  }
  return message || 'An unexpected error occurred';
}

function getUserFromToken(idToken: string): AdminUser | null {
  try {
    const claims = parseJwt(idToken);
    const groups = (claims['cognito:groups'] as string[]) || [];
    if (!groups.includes('ADMIN')) return null;
    return {
      userId: claims.sub as string,
      email: claims.email as string,
      name: (claims.name as string) || (claims.email as string).split('@')[0],
      role: 'ADMIN',
    };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await adminSignIn(email, password);
      const user = getUserFromToken(tokens.IdToken);
      if (!user) {
        throw new Error('Admin access required');
      }
      sessionStorage.setItem(TOKEN_KEYS.ID, tokens.IdToken);
      sessionStorage.setItem(TOKEN_KEYS.ACCESS, tokens.AccessToken);
      sessionStorage.setItem(TOKEN_KEYS.REFRESH, tokens.RefreshToken);
      set({ user, isLoading: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? mapCognitoError(err.message) : 'Login failed';
      set({ isLoading: false, error: msg });
      throw new Error(msg);
    }
  },

  logout: () => {
    sessionStorage.removeItem(TOKEN_KEYS.ID);
    sessionStorage.removeItem(TOKEN_KEYS.ACCESS);
    sessionStorage.removeItem(TOKEN_KEYS.REFRESH);
    set({ user: null, error: null });
  },

  loadStoredAuth: () => {
    const idToken = sessionStorage.getItem(TOKEN_KEYS.ID);
    if (!idToken) return;
    const user = getUserFromToken(idToken);
    if (user) {
      set({ user });
    } else {
      sessionStorage.removeItem(TOKEN_KEYS.ID);
      sessionStorage.removeItem(TOKEN_KEYS.ACCESS);
      sessionStorage.removeItem(TOKEN_KEYS.REFRESH);
    }
  },

  clearError: () => set({ error: null }),
}));
