import type { QuestionOption, QuestionType } from '../types';
import { mergePasteSources } from './wordHtmlCleanup';
import { type EditorSubtype } from './questionPasteDetect';
import { reconstructQuestionApi } from '../api/questionReconstruct';
import { runStagesReconstruction, type ReconstructionDebugInfo } from './reconstructionPipeline';
import { enrichOptionMath } from './equationAutoWrap';
import type { SemanticBlock } from './clipboardIngestion';
import { z } from 'zod';

export const questionOptionSchema = z.object({
  text: z.string().default(''),
  latex: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
});

export const reconstructResultSchema = z.object({
  questionText: z.string().default(''),
  questionHtml: z.string().nullable().optional(),
  questionLatex: z.string().nullable().optional(),
  questionType: z.string().default('descriptive'),
  subtype: z.string().default('descriptive'),
  options: z.array(questionOptionSchema).default([]),
  tags: z.array(z.string()).default([]),
  questionImages: z.array(z.string()).default([]),
  numericalAnswer: z.number().nullable().optional(),
  correctOption: z.number().nullable().optional(),
  explanation: z.string().nullable().optional(),
  warnings: z.array(z.string()).default([]),
  sources: z.object({
    parser: z.boolean().default(true),
    ocr: z.boolean().default(false),
    gemini: z.boolean().default(false),
    ollama: z.boolean().optional(),
  }).default({ parser: true, ocr: false, gemini: false }),
  raw_stem: z.string().default(''),
  raw_options: z.array(questionOptionSchema).default([]),
  layout_blocks: z.array(z.any()).default([]),
  parser_confidence: z.number().default(1.0),
  ocr_confidence: z.number().nullable().optional(),
  debugInfo: z.any().nullable().optional(),
});

function enrichOptionMathSafe(o: any): QuestionOption {
  const res = enrichOptionMath(o);
  return {
    text: res.text,
    latex: res.latex ?? undefined,
    image: res.image ?? undefined,
  };
}

export interface ReconstructResult {
  questionText: string;
  questionHtml: string | null;
  questionLatex: string | null;
  questionType: QuestionType;
  subtype: EditorSubtype;
  options: QuestionOption[];
  tags: string[];
  questionImages: string[];
  numericalAnswer: number | null;
  correctOption: number | null;
  explanation: string | null;
  warnings: string[];
  sources: { parser: boolean; ocr: boolean; gemini: boolean; ollama?: boolean };
  
  // Add temporary structured reconstruction state
  raw_stem: string;
  raw_options: QuestionOption[];
  layout_blocks: Array<{ lines: string[]; options: string[]; passage: string | null; tags: string[] }>;
  parser_confidence: number;
  ocr_confidence: number | null;
  debugInfo?: ReconstructionDebugInfo;
}

export interface ReconstructInput {
  html?: string;
  plain?: string;
  ocrText?: string;
  images?: string[];
  useGemini?: boolean;
  blocks?: SemanticBlock[];
}

function localReconstruct(input: ReconstructInput): ReconstructResult {
  const merged = mergePasteSources({
    html: input.html,
    plain: input.plain,
    ocrText: input.ocrText,
  });
  const images = [...new Set([...(input.images || []), ...merged.images])].slice(0, 6);

  // Run the new 10-stage pipeline
  const pipeline = runStagesReconstruction(merged.plain, merged.html, input.ocrText, input.blocks, input.html);

  // Extract correct option if available (e.g. from answer text matching)
  let correctOption: number | null = null;
  const answerMatch = pipeline.stem.match(/(?:answer|ans|correct)\s*[:\-]?\s*\(?([a-dA-D])\)?/i);
  if (answerMatch) {
    correctOption = answerMatch[1].toUpperCase().charCodeAt(0) - 65;
  } else if (pipeline.subtype === 'mcq_single') {
    correctOption = 0; // Default first option for single MCQ
  }

  // Extract numerical answer if numerical type
  let numericalAnswer: number | null = null;
  if (pipeline.questionType === 'numerical') {
    const numMatch = pipeline.stem.match(/\b\d+(\.\d+)?\b/);
    if (numMatch) {
      numericalAnswer = Number(numMatch[0]);
    }
  }

  // Warnings
  const warnings = ['Parsed locally (server unavailable)', ...pipeline.warnings];

  // Map to ReconstructResult
  return {
    questionText: pipeline.stem,
    questionHtml: merged.html.length > 10 ? merged.html : null,
    questionLatex: pipeline.questionType !== 'mcq' ? (pipeline.stem.match(/\$([^$]+?)\$/) || [])[1] || null : null,
    questionType: pipeline.questionType,
    subtype: pipeline.subtype as EditorSubtype,
    options: pipeline.options,
    tags: [pipeline.subtype, ...(pipeline.warnings.length > 0 ? ['needs_review'] : [])],
    questionImages: images,
    numericalAnswer,
    correctOption,
    explanation: pipeline.explanation || null,
    warnings,
    sources: { parser: true, ocr: Boolean(input.ocrText), gemini: false },
    raw_stem: pipeline.stem,
    raw_options: pipeline.options,
    layout_blocks: [
      {
        lines: pipeline.stem.split('\n'),
        options: pipeline.options.map(o => o.text),
        passage: null,
        tags: [pipeline.subtype]
      }
    ],
    parser_confidence: pipeline.confidence,
    ocr_confidence: input.ocrText ? 0.85 : null,
    debugInfo: pipeline.debugInfo,
  };
}

function mapApiToResult(data: any): ReconstructResult {
  // Validate data with Zod
  const validationResult = reconstructResultSchema.safeParse(data);
  if (!validationResult.success) {
    console.warn('[FORENSIC_LOG] 9. Frontend reconstruction payload validation failure:', validationResult.error, data);
  } else {
    console.log('[FORENSIC_LOG] 9. Frontend reconstruction payload validation success:', validationResult.data);
  }

  const validated = validationResult.success ? validationResult.data : data;

  const result: ReconstructResult = {
    questionText: validated.questionText || '',
    questionHtml: validated.questionHtml ?? null,
    questionLatex: validated.questionLatex ?? null,
    questionType: validated.questionType as QuestionType,
    subtype: (validated.subtype || 'descriptive') as EditorSubtype,
    options: (validated.options || []).map((o: any) => enrichOptionMathSafe(o)),
    tags: validated.tags || [],
    questionImages: validated.questionImages || [],
    numericalAnswer: validated.numericalAnswer ?? null,
    correctOption: validated.correctOption ?? null,
    explanation: validated.explanation ?? null,
    warnings: validated.warnings || [],
    sources: validated.sources || { parser: true, ocr: false, gemini: false },
    raw_stem: validated.raw_stem || validated.questionText || '',
    raw_options: (validated.raw_options || validated.options || []).map((o: any) => enrichOptionMathSafe(o)),
    layout_blocks: validated.layout_blocks || [],
    parser_confidence: validated.parser_confidence ?? 1.0,
    ocr_confidence: validated.ocr_confidence ?? null,
    debugInfo: validated.debugInfo || undefined,
  };

  // Log 9: Mapped frontend reconstruction payload
  console.log('[FORENSIC_LOG] 9. Mapped frontend reconstruction payload:', result);

  return result;
}

let reconstructAbort: AbortController | null = null;

export async function runQuestionReconstruction(
  input: ReconstructInput
): Promise<ReconstructResult> {
  const prepped = mergePasteSources({
    html: input.html,
    plain: input.plain,
    ocrText: input.ocrText,
  });

  if (reconstructAbort) reconstructAbort.abort();
  reconstructAbort = new AbortController();

  try {
    const data = await reconstructQuestionApi(
      {
        html: prepped.html || input.html,
        plain: prepped.plain || input.plain,
        rawHtml: input.html,
        ocrText: input.ocrText,
        images: [...new Set([...(input.images || []), ...prepped.images])],
        useGemini: input.useGemini,
        blocks: input.blocks,
      },
      reconstructAbort.signal
    );
    return mapApiToResult(data);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    console.error('[FORENSIC_LOG] API reconstruction failed, falling back to local reconstruction:', err);
    return localReconstruct(input);
  }
}
