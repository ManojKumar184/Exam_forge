import { apiClient } from './client';
import type { Upload } from '../types';

export interface UploadProcessResult {
  upload: Upload;
  questionsExtracted: number;
  warnings: string[];
}

export async function uploadQuestionFileApi(
  file: File,
  options?: { class?: number }
): Promise<UploadProcessResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.class) formData.append('class', String(options.class));

  const { data } = await apiClient.post<{ success: boolean; data: UploadProcessResult }>(
    '/uploads',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    }
  );
  return data.data;
}

export async function fetchUploadsApi(): Promise<Upload[]> {
  const { data } = await apiClient.get<{ success: boolean; data: Upload[] }>('/uploads');
  return data.data;
}
