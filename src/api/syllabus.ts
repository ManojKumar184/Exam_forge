import { apiClient } from './client';

export interface SyllabusNode {
  _id: string;
  name: string;
  code: string;
  type: 'exam_pattern' | 'class' | 'subject' | 'chapter' | 'topic' | 'subtopic';
  parentId: string | null;
  path: string;
  level: number;
  isActive: boolean;
  isCustom: boolean;
  children?: SyllabusNode[];
}

export interface SyllabusListParams {
  parentId?: string;
  type?: string;
  level?: number;
  search?: string;
}

export async function fetchSyllabusList(params: SyllabusListParams = {}) {
  const { data } = await apiClient.get<{ success: boolean; data: SyllabusNode[] }>(
    '/syllabus',
    { params }
  );
  return data.data;
}

export async function fetchSyllabusTree() {
  const { data } = await apiClient.get<{ success: boolean; data: SyllabusNode[] }>(
    '/syllabus/tree'
  );
  return data.data;
}

export async function fetchSyllabusNode(id: string) {
  const { data } = await apiClient.get<{ success: boolean; data: SyllabusNode }>(
    `/syllabus/${id}`
  );
  return data.data;
}

export async function createSyllabusNode(payload: {
  name: string;
  code: string;
  type: 'exam_pattern' | 'class' | 'subject' | 'chapter' | 'topic' | 'subtopic';
  parentId?: string | null;
  isActive?: boolean;
  isCustom?: boolean;
}) {
  const { data } = await apiClient.post<{ success: boolean; data: SyllabusNode }>(
    '/syllabus',
    payload
  );
  return data.data;
}

export async function updateSyllabusNode(
  id: string,
  payload: {
    name?: string;
    code?: string;
    isActive?: boolean;
  }
) {
  const { data } = await apiClient.patch<{ success: boolean; data: SyllabusNode }>(
    `/syllabus/${id}`,
    payload
  );
  return data.data;
}

export async function deleteSyllabusNode(id: string) {
  const { data } = await apiClient.delete<{ success: boolean; message: string }>(
    `/syllabus/${id}`
  );
  return data;
}
