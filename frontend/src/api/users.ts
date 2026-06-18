import { apiClient } from './client';
import type { Profile } from '../types';

export interface UsersListResponse {
  items: Profile[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchUsersApi(params?: Record<string, unknown>): Promise<UsersListResponse> {
  const { data } = await apiClient.get<{ success: boolean; data: UsersListResponse }>('/users', {
    params,
  });
  return data.data;
}

export async function updateUserApi(id: string, payload: Partial<Profile>): Promise<Profile> {
  const { data } = await apiClient.patch<{ success: boolean; data: Profile }>(`/users/${id}`, payload);
  return data.data;
}

export async function deleteUserApi(id: string): Promise<void> {
  await apiClient.delete(`/users/${id}`);
}
