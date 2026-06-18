import { apiClient } from './client';
import type { Upload } from '../types';

export interface UploadProcessResult {
  upload: Upload;
  questionsExtracted?: number;
  warnings?: string[];
}

export async function uploadQuestionFileApi(
  file: File
): Promise<UploadProcessResult> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await apiClient.post<{ success: boolean; data: any }>(
    '/uploads',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    }
  );
  
  if (data.data && data.data.upload) {
    return data.data;
  }
  return { upload: data.data };
}

export async function uploadManualApi(payload: {
  html?: string;
  plain: string;
}): Promise<UploadProcessResult> {
  const { data } = await apiClient.post<{ success: boolean; data: any }>(
    '/uploads/manual',
    payload
  );
  if (data.data && data.data.upload) {
    return data.data;
  }
  return { upload: data.data };
}

export async function getUploadStatusApi(id: string): Promise<Upload> {
  const { data } = await apiClient.get<{ success: boolean; data: Upload }>(`/uploads/${id}`);
  return data.data;
}

export async function fetchUploadsApi(): Promise<Upload[]> {
  const { data } = await apiClient.get<{ success: boolean; data: Upload[] }>('/uploads');
  return data.data;
}

export async function updateStagedQuestionApi(
  id: string,
  index: number,
  questionFields: any
): Promise<Upload> {
  const { data } = await apiClient.patch<{ success: boolean; data: Upload }>(
    `/uploads/${id}/staging/${index}`,
    questionFields
  );
  return data.data;
}

export async function rejectStagedQuestionApi(
  id: string,
  index: number
): Promise<Upload> {
  const { data } = await apiClient.delete<{ success: boolean; data: Upload }>(
    `/uploads/${id}/staging/${index}`
  );
  return data.data;
}

export async function commitStagedQuestionsApi(
  id: string,
  indices: number[]
): Promise<Upload> {
  const { data } = await apiClient.post<{ success: boolean; data: Upload }>(
    `/uploads/${id}/commit`,
    { indices }
  );
  return data.data;
}

export async function reprocessUploadApi(id: string): Promise<Upload> {
  const { data } = await apiClient.post<{ success: boolean; data: Upload }>(
    `/uploads/${id}/reprocess`
  );
  return data.data;
}

export async function duplicateUploadSessionApi(id: string): Promise<Upload> {
  const { data } = await apiClient.post<{ success: boolean; data: Upload }>(
    `/uploads/${id}/duplicate`
  );
  return data.data;
}

export async function getStagedQuestionDuplicatesApi(
  id: string,
  index: number
): Promise<{
  isDuplicate: boolean;
  duplicateOf: string | null;
  duplicateMethod: string | null;
  duplicateScore: number;
  possibleMatches: Array<{
    id: string;
    question_text: string;
    confidence: number;
    method: string;
  }>;
}> {
  const { data } = await apiClient.get<{ success: boolean; data: any }>(
    `/uploads/${id}/staging/${index}/duplicates`
  );
  return data.data;
}
