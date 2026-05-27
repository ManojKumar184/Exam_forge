import { apiClient } from './client';
import type { AnalyticsData } from '../types';

export async function fetchAdminAnalyticsApi(): Promise<AnalyticsData & Record<string, number>> {
  const { data } = await apiClient.get<{ success: boolean; data: AnalyticsData & Record<string, number> }>(
    '/analytics/admin'
  );
  return data.data;
}

export async function fetchFacultyAnalyticsApi(): Promise<Record<string, number>> {
  const { data } = await apiClient.get<{ success: boolean; data: Record<string, number> }>(
    '/analytics/faculty'
  );
  return data.data;
}

export async function fetchStudentAnalyticsApi(): Promise<Record<string, number>> {
  const { data } = await apiClient.get<{ success: boolean; data: Record<string, number> }>(
    '/analytics/student'
  );
  return data.data;
}

export interface TestPerformanceAnalytics {
  test_id: string;
  total_attempts: number;
  pending_grading: number;
  average_score: number;
  weak_topics: Array<{ topic: string; wrong_count: number }>;
  question_performance: Array<{
    question_id: string;
    question_type: string;
    difficulty: string;
    chapter: string;
    max_marks: number;
    attempts: number;
    correct: number;
    wrong: number;
    skipped: number;
    accuracy_pct: number;
    avg_marks_awarded: number;
  }>;
  descriptive_analytics: Array<{
    question_id: string;
    chapter: string;
    avg_marks_awarded: number;
    max_marks: number;
    graded_rate_pct: number;
  }>;
}

export async function fetchTestPerformanceAnalyticsApi(
  testId: string
): Promise<TestPerformanceAnalytics> {
  const { data } = await apiClient.get<{ success: boolean; data: TestPerformanceAnalytics }>(
    `/analytics/test/${testId}`
  );
  return data.data;
}

export async function fetchSystemMonitorApi(): Promise<any> {
  const { data } = await apiClient.get<{ success: boolean; data: any }>('/analytics/system-monitor');
  return data.data;
}

export async function fetchReplaySummaryApi(): Promise<any> {
  const { data } = await apiClient.get<{ success: boolean; data: any }>('/analytics/replay-summary');
  return data.data;
}

export async function runReplayHarnessApi(): Promise<any> {
  const { data } = await apiClient.post<{ success: boolean; data: any }>('/analytics/run-replay');
  return data.data;
}

