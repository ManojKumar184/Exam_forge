import { apiClient } from './client';

export interface QuestionBank {
  _id: string;
  name: string;
  description: string;
  type: 'system' | 'institution' | 'faculty' | 'custom';
  createdBy: any;
  institution: string | null;
  visibility: 'public' | 'institution' | 'private';
  createdAt: string;
  updatedAt: string;
  isPinned?: boolean;
  pinnedOrder?: number;
  questionCount?: number;
}

export async function fetchQuestionBanksApi(params?: Record<string, unknown>): Promise<QuestionBank[]> {
  const { data } = await apiClient.get<{ success: boolean; data: QuestionBank[] }>('/question-banks', { params });
  return data.data;
}

export async function fetchQuestionBankApi(id: string): Promise<QuestionBank> {
  const { data } = await apiClient.get<{ success: boolean; data: QuestionBank }>(`/question-banks/${id}`);
  return data.data;
}

export async function createQuestionBankApi(payload: Record<string, unknown>): Promise<QuestionBank> {
  const { data } = await apiClient.post<{ success: boolean; data: QuestionBank }>('/question-banks', payload);
  return data.data;
}

export async function updateQuestionBankApi(id: string, payload: Record<string, unknown>): Promise<QuestionBank> {
  const { data } = await apiClient.patch<{ success: boolean; data: QuestionBank }>(`/question-banks/${id}`, payload);
  return data.data;
}

export async function deleteQuestionBankApi(id: string): Promise<void> {
  await apiClient.delete(`/question-banks/${id}`);
}

export async function assignQuestionsToBankApi(bankId: string, questionIds: string[]): Promise<void> {
  await apiClient.post(`/question-banks/${bankId}/questions`, { questionIds });
}

export async function removeQuestionsFromBankApi(bankId: string, questionIds: string[]): Promise<void> {
  await apiClient.delete(`/question-banks/${bankId}/questions`, { data: { questionIds } });
}

export async function reorderQuestionBanksApi(orders: { id: string; isPinned: boolean; pinnedOrder: number }[]): Promise<void> {
  await apiClient.patch('/question-banks/reorder', { orders });
}
