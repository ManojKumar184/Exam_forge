import { apiClient } from './client';
import type { LeaderboardEntry, OnlineTest, TestAttempt } from '../types';

export async function fetchTestsApi(params?: Record<string, unknown>): Promise<OnlineTest[]> {
  const { data } = await apiClient.get<{ success: boolean; data: OnlineTest[] }>('/tests', { params });
  return data.data;
}

export async function fetchTestApi(id: string): Promise<OnlineTest> {
  const { data } = await apiClient.get<{ success: boolean; data: OnlineTest }>(`/tests/${id}`);
  return data.data;
}

export async function createTestApi(payload: Record<string, unknown>): Promise<OnlineTest> {
  const { data } = await apiClient.post<{ success: boolean; data: OnlineTest }>('/tests', payload);
  return data.data;
}

export async function updateTestApi(id: string, payload: Record<string, unknown>): Promise<OnlineTest> {
  const { data } = await apiClient.patch<{ success: boolean; data: OnlineTest }>(`/tests/${id}`, payload);
  return data.data;
}

export async function startTestApi(id: string): Promise<{ test: OnlineTest; attempt: TestAttempt }> {
  const { data } = await apiClient.post<{ success: boolean; data: { test: OnlineTest; attempt: TestAttempt } }>(
    `/tests/${id}/start`
  );
  return data.data;
}

export async function autosaveTestApi(
  id: string,
  payload: Record<string, unknown>
): Promise<TestAttempt> {
  const { data } = await apiClient.post<{ success: boolean; data: TestAttempt }>(
    `/tests/${id}/autosave`,
    payload
  );
  return data.data;
}

export async function submitTestApi(id: string): Promise<TestAttempt> {
  const { data } = await apiClient.post<{ success: boolean; data: TestAttempt }>(`/tests/${id}/submit`);
  return data.data;
}

export async function autoSubmitTestApi(id: string): Promise<TestAttempt> {
  const { data } = await apiClient.post<{ success: boolean; data: TestAttempt }>(
    `/tests/${id}/auto-submit`
  );
  return data.data;
}

export async function fetchTestAttemptsApi(testId?: string): Promise<TestAttempt[]> {
  if (!testId) {
    const { data } = await apiClient.get<{ success: boolean; data: TestAttempt[] }>('/tests/attempts/me');
    return data.data;
  }
  const { data } = await apiClient.get<{ success: boolean; data: TestAttempt[] }>(`/tests/${testId}/attempts`);
  return data.data;
}

export async function fetchTestLeaderboardApi(testId: string): Promise<LeaderboardEntry[]> {
  const { data } = await apiClient.get<{ success: boolean; data: LeaderboardEntry[] }>(
    `/tests/${testId}/leaderboard`
  );
  return data.data;
}

