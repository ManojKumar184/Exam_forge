import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  apiForgotPassword,
  apiGetMe,
  apiLogin,
  apiLogout,
  apiRegister,
  apiResetPassword,
  apiUpdateProfile,
} from '../api/auth';
import { clearTokens, getRefreshToken, setTokens } from '../api/client';
import { getApiErrorMessage } from '../api/client';
import { apiConfig } from '../config/api';
import type { Profile, UserRole } from '../types';

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isInitialized: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
    institution?: string
  ) => Promise<{ error: { message: string } | null; pendingApproval?: boolean }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: unknown }>;
  refreshProfile: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ error: { message: string } | null; data?: unknown }>;
  resetPassword: (
    token: string,
    password: string
  ) => Promise<{ error: { message: string } | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  const applySession = useCallback((session: { user: AuthUser; profile: Profile }) => {
    setUser(session.user);
    setProfile(session.profile);
  }, []);

  const initialize = useCallback(async () => {
    if (!apiConfig.isConfigured) {
      setIsLoading(false);
      setIsInitialized(true);
      return;
    }

    try {
      setIsLoading(true);
      const me = await apiGetMe();
      applySession({ user: me.user, profile: me.profile });
    } catch {
      clearTokens();
      setUser(null);
      setProfile(null);
    } finally {
      setIsLoading(false);
      setIsInitialized(true);
    }
  }, [applySession]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const data = await apiLogin(email, password);
      setTokens(data.accessToken, data.refreshToken);
      applySession({ user: data.user, profile: data.profile });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    } finally {
      setIsLoading(false);
    }
  }, [applySession]);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      role: UserRole,
      institution?: string
    ) => {
      try {
        setIsLoading(true);
        const data = await apiRegister({
          email,
          password,
          fullName,
          role,
          schoolInstitute: institution,
        });
        if (data.pendingApproval) {
          return { error: null, pendingApproval: true };
        }
        setTokens(data.accessToken, data.refreshToken);
        applySession({ user: data.user, profile: data.profile });
        return { error: null };
      } catch (error) {
        return { error: { message: getApiErrorMessage(error) } };
      } finally {
        setIsLoading(false);
      }
    },
    [applySession]
  );

  const signOut = useCallback(async () => {
    try {
      const refreshToken = getRefreshToken();
      await apiLogout(refreshToken);
    } catch {
      // clear local session even if API fails
    } finally {
      clearTokens();
      setUser(null);
      setProfile(null);
    }
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<Profile>) => {
      try {
        const updated = await apiUpdateProfile(updates);
        setProfile(updated);
        return { error: null };
      } catch (error) {
        return { error };
      }
    },
    []
  );

  const refreshProfile = useCallback(async () => {
    const me = await apiGetMe();
    applySession({ user: me.user, profile: me.profile });
  }, [applySession]);

  const forgotPassword = useCallback(async (email: string) => {
    try {
      const data = await apiForgotPassword(email);
      return { error: null, data };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    try {
      await apiResetPassword(token, password);
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      isLoading,
      isAuthenticated: Boolean(user && profile),
      isInitialized,
      initialize,
      signIn,
      signUp,
      signOut,
      updateProfile,
      refreshProfile,
      forgotPassword,
      resetPassword,
    }),
    [
      user,
      profile,
      isLoading,
      isInitialized,
      initialize,
      signIn,
      signUp,
      signOut,
      updateProfile,
      refreshProfile,
      forgotPassword,
      resetPassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return ctx;
}
