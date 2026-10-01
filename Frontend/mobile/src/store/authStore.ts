import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  signIn,
  signUp,
  confirmSignUp,
  signOut,
  refreshTokens,
  googleSignIn,
  parseJwt,
  isTokenExpired,
  getCognitoErrorMessage,
  CognitoTokens,
} from '../services/cognito';

export type UserRole = 'citizen' | 'crew' | 'admin';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  cognitoSub: string;
}

interface AuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  error: string | null;
  pendingEmail: string | null;

  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (email: string, password: string, name: string, phone: string) => Promise<void>;
  confirmOtp: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  clearError: () => void;
  setPendingEmail: (email: string) => void;
}

// ---------- platform-safe storage helpers ----------
const isWeb = Platform.OS === 'web';

async function storageSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function storageGet(key: string): Promise<string | null> {
  if (isWeb) {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function storageDelete(key: string): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}
// ---------------------------------------------------

// FIX: Cognito stores/sends roles as UPPERCASE ('CREW', 'CITIZEN', 'ADMIN')
// Always normalize to lowercase before comparing
function extractRole(payload: Record<string, unknown>): UserRole {
  const customRole = payload['custom:role'] as string | undefined;
  if (customRole) {
    const normalized = customRole.toLowerCase();
    if (['citizen', 'crew', 'admin'].includes(normalized)) return normalized as UserRole;
  }
  // Fallback: check Cognito groups (also UPPERCASE)
  const groups = payload['cognito:groups'] as string[] | undefined;
  if (groups && groups.length > 0) {
    const group = groups[0].toLowerCase();
    if (group === 'crew') return 'crew';
    if (group === 'admin') return 'admin';
  }
  return 'citizen';
}

function buildUserFromTokens(tokens: CognitoTokens): AuthUser {
  const payload = parseJwt(tokens.idToken);
  const role = extractRole(payload);
  return {
    userId: (payload.sub as string) ?? '',
    cognitoSub: (payload.sub as string) ?? '',
    email: (payload.email as string) ?? '',
    name: (payload.name as string) ?? (payload.email as string) ?? '',
    role,
  };
}

async function storeTokens(tokens: CognitoTokens): Promise<void> {
  await Promise.all([
    storageSet('idToken', tokens.idToken),
    storageSet('accessToken', tokens.accessToken),
    storageSet('refreshToken', tokens.refreshToken),
  ]);
}

async function clearTokens(): Promise<void> {
  await Promise.all([
    storageDelete('idToken'),
    storageDelete('accessToken'),
    storageDelete('refreshToken'),
    storageDelete('user'),
  ]);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tokens: null,
  isLoading: false,
  error: null,
  pendingEmail: null,

  clearError: () => set({ error: null }),
  setPendingEmail: (email) => set({ pendingEmail: email }),

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await signIn(email, password);
      // Always derive role fresh from JWT on login
      const user = buildUserFromTokens(tokens);
      await storeTokens(tokens);
      await storageSet('user', JSON.stringify(user));
      set({ user, tokens, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: getCognitoErrorMessage(err) });
      throw err;
    }
  },

  loginWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await googleSignIn();
      const user = buildUserFromTokens(tokens);
      await storeTokens(tokens);
      await storageSet('user', JSON.stringify(user));
      set({ user, tokens, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: getCognitoErrorMessage(err) });
      throw err;
    }
  },

  register: async (email, password, name, phone) => {
    set({ isLoading: true, error: null });
    try {
      await signUp(email, password, name, phone);
      set({ isLoading: false, pendingEmail: email });
    } catch (err) {
      set({ isLoading: false, error: getCognitoErrorMessage(err) });
      throw err;
    }
  },

  confirmOtp: async (email, code) => {
    set({ isLoading: true, error: null });
    try {
      await confirmSignUp(email, code);
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: getCognitoErrorMessage(err) });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      const { tokens } = get();
      if (tokens?.accessToken) {
        await signOut(tokens.accessToken).catch(() => {});
      }
    } finally {
      await clearTokens();
      set({ user: null, tokens: null, isLoading: false, error: null });
    }
  },

  loadStoredAuth: async () => {
    set({ isLoading: true });
    try {
      const [idToken, accessToken, refreshToken, userJson] = await Promise.all([
        storageGet('idToken'),
        storageGet('accessToken'),
        storageGet('refreshToken'),
        storageGet('user'),
      ]);

      if (!idToken || !accessToken || !refreshToken) {
        set({ isLoading: false });
        return;
      }

      if (isTokenExpired(idToken)) {
        try {
          const newTokens = await refreshTokens(refreshToken);
          // Re-derive role from the fresh token
          const user = buildUserFromTokens(newTokens);
          await storeTokens(newTokens);
          await storageSet('user', JSON.stringify(user));
          set({ user, tokens: newTokens, isLoading: false });
          return;
        } catch {
          await clearTokens();
          set({ isLoading: false });
          return;
        }
      }

      const tokens: AuthTokens = { idToken, accessToken, refreshToken };

      // FIX: ALWAYS re-derive role from JWT — never trust the cached role.
      // The cached user may have been saved when the role was wrong.
      const freshUser = buildUserFromTokens(tokens);

      // Only borrow name/email from cache if JWT doesn't provide them
      if (userJson) {
        const cached = JSON.parse(userJson) as AuthUser;
        if (!freshUser.name && cached.name) freshUser.name = cached.name;
        if (!freshUser.email && cached.email) freshUser.email = cached.email;
      }

      // Persist the corrected user so future launches are also correct
      await storageSet('user', JSON.stringify(freshUser));

      set({ user: freshUser, tokens, isLoading: false });
    } catch {
      await clearTokens();
      set({ isLoading: false });
    }
  },
}));