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

export interface PaperSelectionResult {
  sections: Array<{
    sectionId: string;
    sectionName: string;
    marksPerQuestion: number;
    questions: Array<Record<string, unknown>>;
  }>;
  total_questions: number;
  total_marks: number;
  validation: { valid: boolean; warnings: string[]; actual_questions: number; actual_marks: number };
}

export interface PoolStats {
  total: number;
  by_difficulty: { easy: number; medium: number; hard: number };
  by_type: { mcq: number; descriptive: number; numerical: number };
  by_chapter: Record<string, number>;
}

export async function fetchPaperPoolStatsApi(payload: Record<string, unknown>): Promise<PoolStats> {
  const { data } = await apiClient.post<{ success: boolean; data: PoolStats }>(
    '/papers/pool-stats',
    payload
  );
  return data.data;
}

export async function selectQuestionsForPaperApi(
  payload: Record<string, unknown>
): Promise<PaperSelectionResult & { pool_stats?: PoolStats }> {
  const { data } = await apiClient.post<{ success: boolean; data: PaperSelectionResult }>(
    '/papers/select-questions',
    payload
  );
  return data.data;
}

export type PaperExportType = 'paper' | 'answer_key';

export async function downloadPaperPdfApi(
  paperId: string,
  options: { type?: PaperExportType; allowDraft?: boolean; paperSet?: string } = {}
): Promise<Blob> {
  const { data } = await apiClient.get(`/papers/${paperId}/export/pdf`, {
    params: {
      type: options.type === 'answer_key' ? 'answer_key' : 'paper',
      allow_draft: options.allowDraft ? 'true' : undefined,
      paper_set: options.paperSet,
    },
    responseType: 'blob',
    timeout: 120000,
  });
  return data;
}

