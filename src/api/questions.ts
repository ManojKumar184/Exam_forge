import { apiClient } from './client';
import type { Question } from '../types';

export interface QuestionsListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  subject_id?: string;
  chapter_id?: string;
  exam_type_id?: string;
  class?: number;
  difficulty?: string;
  question_type?: string;
  source?: string;
  upload_id?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface QuestionsListResponse {
  items: Question[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function fetchQuestionsApi(params: QuestionsListParams = {}) {
  const { data } = await apiClient.get<{ success: boolean; data: QuestionsListResponse }>(
    '/questions',
    { params }
  );
  return data.data;
}

export async function fetchQuestionApi(id: string) {
  const { data } = await apiClient.get<{ success: boolean; data: Question }>(`/questions/${id}`);
  return data.data;
}

export async function createQuestionApi(payload: Partial<Question>) {
  const { data } = await apiClient.post<{ success: boolean; data: Question }>(
    '/questions',
    payload
  );
  return data.data;
}

export async function updateQuestionApi(id: string, payload: Partial<Question>) {
  const { data } = await apiClient.patch<{ success: boolean; data: Question }>(
    `/questions/${id}`,
    payload
  );
  return data.data;
}

export async function deleteQuestionApi(id: string) {
  await apiClient.delete(`/questions/${id}`);
}

export async function approveQuestionApi(id: string) {
  const { data } = await apiClient.post<{ success: boolean; data: Question }>(
    `/questions/${id}/approve`
  );
  return data.data;
}

export async function rejectQuestionApi(id: string, notes: string) {
  const { data } = await apiClient.post<{ success: boolean; data: Question }>(
    `/questions/${id}/reject`,
    { notes, review_notes: notes }
  );
  return data.data;
}

export async function bulkApproveQuestionsApi(ids: string[]) {
  await apiClient.post('/questions/bulk/approve', { ids });
}

export async function bulkRejectQuestionsApi(ids: string[], notes?: string) {
  await apiClient.post('/questions/bulk/reject', { ids, notes });
}

export async function bulkDeleteQuestionsApi(ids: string[]) {
  await apiClient.post('/questions/bulk/delete', { ids });
}

export async function fetchQuestionsCountApi(
  params: QuestionsListParams = {}
): Promise<{ total: number; breakdown: Array<{ _id: { difficulty: string; questionType: string }; count: number }> }> {
  const { data } = await apiClient.get<{ success: boolean; data: { total: number; breakdown: unknown[] } }>(
    '/questions/meta/count',
    { params }
  );
  return data.data as { total: number; breakdown: Array<{ _id: { difficulty: string; questionType: string }; count: number }> };
}

export async function bulkUpdateQuestionsMetadataApi(
  ids: string[],
  updates: Record<string, unknown>
) {
  const { data } = await apiClient.post<{ success: boolean; data: { modified: number } }>(
    '/questions/bulk/update-metadata',
    { ids, updates }
  );
  return data.data;
}
