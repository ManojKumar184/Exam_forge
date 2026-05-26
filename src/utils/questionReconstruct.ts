import type { QuestionOption, QuestionType } from '../types';
import { mergePasteSources } from './wordHtmlCleanup';
import { type EditorSubtype } from './questionPasteDetect';
import { reconstructQuestionApi } from '../api/questionReconstruct';
import { runStagesReconstruction, type ReconstructionDebugInfo } from './reconstructionPipeline';
import { enrichOptionMath } from './equationAutoWrap';
import type { SemanticBlock } from './clipboardIngestion';

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
    subtype: pipeline.subtype,
    options: pipeline.options,
    tags: [pipeline.subtype, ...(pipeline.warnings.length > 0 ? ['needs_review'] : [])],
    questionImages: images,
    numericalAnswer,
    correctOption,
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
  return {
    questionText: data.questionText || '',
    questionHtml: data.questionHtml ?? null,
    questionLatex: data.questionLatex ?? null,
    questionType: data.questionType as QuestionType,
    subtype: (data.subtype || 'descriptive') as EditorSubtype,
    options: (data.options || []).map((o: any) => enrichOptionMathSafe(o)),
    tags: data.tags || [],
    questionImages: data.questionImages || [],
    numericalAnswer: data.numericalAnswer ?? null,
    correctOption: data.correctOption ?? null,
    warnings: data.warnings || [],
    sources: data.sources || { parser: true, ocr: false, gemini: false },
    raw_stem: data.raw_stem || data.questionText || '',
    raw_options: (data.raw_options || data.options || []).map((o: any) => enrichOptionMathSafe(o)),
    layout_blocks: data.layout_blocks || [],
    parser_confidence: data.parser_confidence ?? 1.0,
    ocr_confidence: data.ocr_confidence ?? null,
    debugInfo: data.debugInfo || undefined,
  };
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
  } catch {
    return localReconstruct(input);
  }
}
