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

