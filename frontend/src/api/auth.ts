import { apiClient } from './client';
import type { Profile, UserRole } from '../types';

export interface AuthResponse {
  user: { id: string; email: string };
  profile: Profile;
  accessToken?: string;
  refreshToken?: string;
  pendingApproval?: boolean;
}

export async function apiRegister(payload: {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  schoolInstitute?: string;
}) {
  const { data } = await apiClient.post<{ success: boolean; data: AuthResponse }>(
    '/auth/register',
    payload
  );
  return data.data;
}

export async function apiLogin(email: string, password: string) {
  const { data } = await apiClient.post<{ success: boolean; data: AuthResponse }>(
    '/auth/login',
    { email, password }
  );
  return data.data;
}

export async function apiLogout() {
  try {
    await apiClient.post('/auth/logout');
  } catch (error) {
    if (!(error instanceof Error) || !('response' in error) || (error as { response?: { status?: number } }).response?.status !== 401) throw error;
    await apiClient.post('/auth/refresh', {});
    await apiClient.post('/auth/logout');
  }
}

export async function apiGetMe() {
  const { data } = await apiClient.get<{
    success: boolean;
    data: { user: { id: string; email: string }; profile: Profile };
  }>('/auth/me');
  return data.data;
}

export async function apiUpdateProfile(updates: Partial<Profile>) {
  const { data } = await apiClient.patch<{ success: boolean; data: { profile: Profile } }>(
    '/auth/me',
    updates
  );
  return data.data.profile;
}

export async function apiForgotPassword(email: string) {
  const { data } = await apiClient.post('/auth/forgot-password', { email });
  return data.data;
}

export async function apiResetPassword(token: string, password: string) {
  const { data } = await apiClient.post('/auth/reset-password', { token, password });
  return data.data;
}
