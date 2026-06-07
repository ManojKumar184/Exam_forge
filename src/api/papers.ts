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

export interface ExportOptions {
  type?: PaperExportType;
  allowDraft?: boolean;
  paperSet?: string;
  layout?: 'single_column' | 'two_column';
  margin?: 'narrow' | 'normal' | 'wide';
  fontFamily?: string;
  fontSize?: number;
  lineSpacing?: number;
  showInstitutionLogo?: boolean;
  institutionName?: string;
  examinationName?: string;
  subjectName?: string;
  className?: string;
  customHeaderText?: string;
  showPageNumber?: boolean;
  footerInstitutionName?: string;
  customFooterText?: string;
  template?: string;
  showCoverPage?: boolean;
  numberingMode?: 'continuous' | 'section_wise';
  watermarkText?: string | null;
  watermarkOpacity?: number;
  watermarkSize?: number;
  watermarkRotation?: number;
  exportTypeFormat?: string;
}

function mapOptionsToParams(options: ExportOptions) {
  return {
    type: options.type === 'answer_key' ? 'answer_key' : 'paper',
    allow_draft: options.allowDraft ? 'true' : undefined,
    paper_set: options.paperSet,
    layout: options.layout,
    margin: options.margin,
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    lineSpacing: options.lineSpacing,
    showInstitutionLogo: options.showInstitutionLogo !== undefined ? (options.showInstitutionLogo ? 'true' : 'false') : undefined,
    institutionName: options.institutionName,
    examinationName: options.examinationName,
    subjectName: options.subjectName,
    className: options.className,
    customHeaderText: options.customHeaderText,
    showPageNumber: options.showPageNumber !== undefined ? (options.showPageNumber ? 'true' : 'false') : undefined,
    footerInstitutionName: options.footerInstitutionName,
    customFooterText: options.customFooterText,
    template: options.template,
    showCoverPage: options.showCoverPage !== undefined ? (options.showCoverPage ? 'true' : 'false') : undefined,
    numberingMode: options.numberingMode,
    watermarkText: options.watermarkText,
    watermarkOpacity: options.watermarkOpacity,
    watermarkSize: options.watermarkSize,
    watermarkRotation: options.watermarkRotation,
    exportTypeFormat: options.exportTypeFormat,
  };
}

export async function downloadPaperPdfApi(
  paperId: string,
  options: ExportOptions = {}
): Promise<Blob> {
  const { data } = await apiClient.get(`/papers/${paperId}/export/pdf`, {
    params: mapOptionsToParams(options),
    responseType: 'blob',
    timeout: 120000,
  });
  return data;
}

export async function downloadPaperDocxApi(
  paperId: string,
  options: ExportOptions = {}
): Promise<Blob> {
  const { data } = await apiClient.get(`/papers/${paperId}/export/docx`, {
    params: mapOptionsToParams(options),
    responseType: 'blob',
    timeout: 120000,
  });
  return data;
}

export async function fetchPaperHtmlApi(
  paperId: string,
  options: ExportOptions = {}
): Promise<string> {
  const { data } = await apiClient.get<string>(`/papers/${paperId}/export/html`, {
    params: mapOptionsToParams(options),
  });
  return data;
}

// Templates API
import type { ExamTemplate, ExportPreset, InstitutionProfile } from '../types';

export async function fetchTemplatesApi(): Promise<ExamTemplate[]> {
  const { data } = await apiClient.get<{ success: boolean; data: ExamTemplate[] }>('/exam-templates');
  return data.data;
}

export async function fetchTemplateApi(id: string): Promise<ExamTemplate> {
  const { data } = await apiClient.get<{ success: boolean; data: ExamTemplate }>(`/exam-templates/${id}`);
  return data.data;
}

export async function createTemplateApi(payload: Partial<ExamTemplate>): Promise<ExamTemplate> {
  const { data } = await apiClient.post<{ success: boolean; data: ExamTemplate }>('/exam-templates', payload);
  return data.data;
}

export async function updateTemplateApi(id: string, payload: Partial<ExamTemplate>): Promise<ExamTemplate> {
  const { data } = await apiClient.patch<{ success: boolean; data: ExamTemplate }>(`/exam-templates/${id}`, payload);
  return data.data;
}

export async function deleteTemplateApi(id: string): Promise<void> {
  await apiClient.delete(`/exam-templates/${id}`);
}

export async function duplicateTemplateApi(id: string): Promise<ExamTemplate> {
  const { data } = await apiClient.post<{ success: boolean; data: ExamTemplate }>(`/exam-templates/${id}/duplicate`);
  return data.data;
}

// Export Presets API
export async function fetchPresetsApi(): Promise<ExportPreset[]> {
  const { data } = await apiClient.get<{ success: boolean; data: ExportPreset[] }>('/export-presets');
  return data.data;
}

export async function createPresetApi(payload: Partial<ExportPreset>): Promise<ExportPreset> {
  const { data } = await apiClient.post<{ success: boolean; data: ExportPreset }>('/export-presets', payload);
  return data.data;
}

export async function deletePresetApi(id: string): Promise<void> {
  await apiClient.delete(`/export-presets/${id}`);
}

// Institution Profile API
export async function fetchInstitutionProfileApi(): Promise<InstitutionProfile | null> {
  try {
    const { data } = await apiClient.get<{ success: boolean; data: InstitutionProfile }>('/institution-profiles');
    return data.data;
  } catch (err) {
    return null;
  }
}

export async function saveInstitutionProfileApi(payload: Partial<InstitutionProfile>): Promise<InstitutionProfile> {
  const { data } = await apiClient.post<{ success: boolean; data: InstitutionProfile }>('/institution-profiles', payload);
  return data.data;
}

