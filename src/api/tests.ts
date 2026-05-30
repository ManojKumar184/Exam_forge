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

export async function startTestApi(
  id: string,
  accessCode?: string
): Promise<{ test: OnlineTest; attempt: TestAttempt }> {
  const { data } = await apiClient.post<{ success: boolean; data: { test: OnlineTest; attempt: TestAttempt } }>(
    `/tests/${id}/start`,
    { accessCode }
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

export interface AttemptReviewPayload {
  test_id: string;
  attempt: TestAttempt;
  show_answers: boolean;
  allow_review: boolean;
}

export async function fetchAttemptReviewApi(
  testId: string,
  attemptId: string
): Promise<AttemptReviewPayload> {
  const { data } = await apiClient.get<{ success: boolean; data: AttemptReviewPayload }>(
    `/tests/${testId}/attempts/${attemptId}`
  );
  return data.data;
}

export async function fetchGradingQueueApi(testId: string): Promise<TestAttempt[]> {
  const { data } = await apiClient.get<{ success: boolean; data: TestAttempt[] }>(
    `/tests/${testId}/grading-queue`
  );
  return data.data;
}

export async function gradeAttemptApi(
  testId: string,
  attemptId: string,
  grades: Array<{ answer_id: string; marks: number; remarks?: string | null }>
): Promise<TestAttempt> {
  const { data } = await apiClient.patch<{ success: boolean; data: TestAttempt }>(
    `/tests/${testId}/attempts/${attemptId}/grade`,
    { grades }
  );
  return data.data;
}

export async function deleteTestApi(id: string): Promise<void> {
  await apiClient.delete(`/tests/${id}`);
}

