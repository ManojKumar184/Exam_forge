import { apiClient } from './client';
import type { Subject, Chapter, ExamType } from '../types';

export async function fetchSubjectsApi(): Promise<Subject[]> {
  const { data } = await apiClient.get<{ success: boolean; data: Subject[] }>('/subjects');
  return data.data;
}

export async function fetchChaptersApi(subjectId?: string): Promise<Chapter[]> {
  const params = subjectId ? { subject_id: subjectId } : {};
  const { data } = await apiClient.get<{ success: boolean; data: Chapter[] }>('/chapters', {
    params,
  });
  return data.data;
}

export async function fetchExamTypesApi(): Promise<ExamType[]> {
  const { data } = await apiClient.get<{ success: boolean; data: ExamType[] }>('/exam-types');
  return data.data;
}
