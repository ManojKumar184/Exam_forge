import { apiClient } from './client';
import type { QuestionOption, QuestionType } from '../types';

import type { ReconstructionDebugInfo } from '../utils/reconstructionPipeline';

export interface ReconstructApiResult {
  questionText: string;
  questionHtml: string | null;
  questionLatex: string | null;
  questionType: QuestionType;
  subtype: string;
  options: QuestionOption[];
  tags: string[];
  questionImages: string[];
  numericalAnswer: number | null;
  correctOption: number | null;
  warnings: string[];
  sources: { parser: boolean; ocr: boolean; gemini: boolean };
  debugInfo?: ReconstructionDebugInfo;
}

import type { SemanticBlock } from '../utils/clipboardIngestion';

export interface ReconstructApiBody {
  html?: string;
  plain?: string;
  ocrText?: string;
  images?: string[];
  useGemini?: boolean;
  blocks?: SemanticBlock[];
}

export async function reconstructQuestionApi(
  body: ReconstructApiBody,
  signal?: AbortSignal
): Promise<ReconstructApiResult> {
  const { data } = await apiClient.post<{ success: boolean; data: ReconstructApiResult }>(
    '/questions/reconstruct',
    body,
    { signal, timeout: 120_000 }
  );
  return data.data;
}
