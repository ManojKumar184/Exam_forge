import { apiClient } from './client';
import type { Paper } from '../types';

export async function fetchPapersApi(params?: Record<string, unknown>): Promise<Paper[]> {
  const { data } = await apiClient.get<{ success: boolean; data: Paper[] }>('/papers', { params });
  return data.data;
}

export async function fetchPaperApi(id: string): Promise<Paper> {
  const { data } = await apiClient.get<{ success: boolean; data: Paper }>(`/papers/${id}`);
  return data.data;
}

export async function createPaperApi(payload: Partial<Paper>): Promise<Paper> {
  const { data } = await apiClient.post<{ success: boolean; data: Paper }>('/papers', payload);
  return data.data;
}

export async function updatePaperApi(id: string, payload: Partial<Paper>): Promise<Paper> {
  const { data } = await apiClient.patch<{ success: boolean; data: Paper }>(`/papers/${id}`, payload);
  return data.data;
}

export async function deletePaperApi(id: string): Promise<void> {
  await apiClient.delete(`/papers/${id}`);
}

export async function generatePaperApi(payload: Record<string, unknown>): Promise<Paper> {
  const { data } = await apiClient.post<{ success: boolean; data: Paper }>('/papers/generate', payload);
  return data.data;
}

