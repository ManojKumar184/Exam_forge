import type { QuestionOption, QuestionType } from '../types';
import { mergePasteSources, cleanPlainText } from './wordHtmlCleanup';
import { detectFromPastedContent, type EditorSubtype } from './questionPasteDetect';
import { enrichOptionMath } from './equationAutoWrap';
import { extractMcqOptions } from './mcqReconstruct';
import { preprocessDocumentText, splitTextIntoBlocks } from './textBlocksParser';
import { reconstructQuestionApi, type ReconstructApiResult } from '../api/questionReconstruct';

export interface ReconstructInput {
  html?: string;
  plain?: string;
  ocrText?: string;
  images?: string[];
  useGemini?: boolean;
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
  sources: { parser: boolean; ocr: boolean; gemini: boolean };
}

function pickBestBlock<T extends { lines: string[]; options: { text: string }[] }>(blocks: T[]): T | null {
  if (!blocks.length) return null;
  if (blocks.length === 1) return blocks[0];
  return blocks.reduce((best, b) => {
    const sa = b.lines.join('').length + b.options.length * 80;
    const sb = best.lines.join('').length + best.options.length * 80;
    return sb > sa ? b : best;
  });
}

function localReconstruct(input: ReconstructInput): ReconstructResult {
  const warnings: string[] = ['Parsed locally (server unavailable)'];
  const merged = mergePasteSources({
    html: input.html,
    plain: input.plain,
    ocrText: input.ocrText,
  });
  const images = [...new Set([...(input.images || []), ...merged.images])].slice(0, 6);

  let plain = cleanPlainText(merged.plain);
  const ordered = preprocessDocumentText(plain);
  const block = pickBestBlock(splitTextIntoBlocks(ordered));

  let stem = plain;
  let options: QuestionOption[] = [];

  if (block) {
    stem = block.passage
      ? `${block.passage}\n\n${block.lines.join('\n')}`.trim()
      : block.lines.join('\n').trim();
    if (block.options.length >= 2) {
      options = block.options.map((o) => enrichOptionMath({ text: o.text }));
    }
  }

  const mcq = extractMcqOptions(stem);
  if (mcq.options.length >= 2) {
    stem = mcq.stem || stem;
    options = mcq.options.map((o) => enrichOptionMath(o));
  }

  const detected = detectFromPastedContent(stem);
  if (detected.options.length >= 2) {
    options = detected.options.map((o) => enrichOptionMath(o));
    stem = detected.questionText;
  }

  return {
    questionText: stem,
    questionHtml: merged.html.length > 10 ? merged.html : null,
    questionLatex: null,
    questionType: detected.questionType,
    subtype: detected.subtype,
    options,
    tags: detected.tags,
    questionImages: images,
    numericalAnswer: null,
    correctOption: detected.subtype === 'mcq_single' ? 0 : null,
    warnings,
    sources: { parser: true, ocr: Boolean(input.ocrText), gemini: false },
  };
}

function mapApiToResult(data: ReconstructApiResult): ReconstructResult {
  return {
    questionText: data.questionText || '',
    questionHtml: data.questionHtml ?? null,
    questionLatex: data.questionLatex ?? null,
    questionType: data.questionType as QuestionType,
    subtype: (data.subtype || 'descriptive') as EditorSubtype,
    options: (data.options || []).map((o) => enrichOptionMath(o)),
    tags: data.tags || [],
    questionImages: data.questionImages || [],
    numericalAnswer: data.numericalAnswer ?? null,
    correctOption: data.correctOption ?? null,
    warnings: data.warnings || [],
    sources: data.sources || { parser: true, ocr: false, gemini: false },
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
        ocrText: input.ocrText,
        images: [...new Set([...(input.images || []), ...prepped.images])],
        useGemini: input.useGemini,
      },
      reconstructAbort.signal
    );
    return mapApiToResult(data);
  } catch {
    return localReconstruct(input);
  }
}
