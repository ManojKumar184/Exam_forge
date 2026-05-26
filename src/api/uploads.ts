import { apiClient } from './client';
import type { Upload } from '../types';

export interface UploadProcessResult {
  upload: Upload;
  questionsExtracted?: number;
  warnings?: string[];
}

export async function uploadQuestionFileApi(
  file: File,
  options?: { class?: number; subject_id?: string; exam_type_id?: string }
): Promise<UploadProcessResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.class) formData.append('class', String(options.class));
  if (options?.subject_id) formData.append('subject_id', options.subject_id);
  if (options?.exam_type_id) formData.append('exam_type_id', options.exam_type_id);

  const { data } = await apiClient.post<{ success: boolean; data: any }>(
    '/uploads',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    }
  );
  
  // Accept both synchronous (old) and asynchronous response payload structures
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
