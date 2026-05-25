import type { QuestionOption, QuestionType } from '../types';
import { cleanPlainText, cleanupWordHtml } from './wordHtmlCleanup';
import { extractMcqOptions, countMcqMarkers } from './mcqReconstruct';
import { autoWrapEquations } from './equationAutoWrap';

export type EditorSubtype =
  | 'mcq_single'
  | 'mcq_multiple'
  | 'integer'
  | 'numerical'
  | 'descriptive'
  | 'comprehension'
  | 'match_following';

const MCQ_MULTIPLE_RE =
  /one\s+or\s+more\s+correct|multiple\s+correct|select\s+all\s+that\s+apply/i;
const INTEGER_RE = /integer\s+(?:value|answer|type)|answer\s+in\s+integer/i;
const NUMERICAL_RE = /numerical\s+(?:value|answer|type)|numeric\s+answer/i;
const MATCH_RE = /match\s+(?:the\s+)?following|column\s+i\b|list-?\s*i\b/i;
const COMPREHENSION_RE =
  /comprehension|passage\s*based|read\s+the\s+following\s+passage|based\s+on\s+the\s+above/i;

export interface PasteDetectResult {
  subtype: EditorSubtype;
  questionType: QuestionType;
  questionText: string;
  options: QuestionOption[];
  tags: string[];
}

export function detectFromPastedContent(raw: string): PasteDetectResult {
  const cleaned = raw.includes('<') ? cleanupWordHtml(raw) : { html: '', plain: cleanPlainText(raw), images: [] };
  const text = autoWrapEquations(cleaned.plain);
  const lower = text.toLowerCase();

  if (COMPREHENSION_RE.test(lower)) {
    return {
      subtype: 'comprehension',
      questionType: 'descriptive',
      questionText: text.trim(),
      options: [],
      tags: ['comprehension'],
    };
  }

  if (MATCH_RE.test(lower)) {
    return {
      subtype: 'match_following',
      questionType: 'descriptive',
      questionText: text.trim(),
      options: [],
      tags: ['match_following'],
    };
  }

  const inline = extractMcqOptions(text);
  const stem = inline.stem || text;
  const optionCount = Math.max(inline.options.length, countMcqMarkers(stem));

  if (MCQ_MULTIPLE_RE.test(lower) && optionCount >= 2) {
    return {
      subtype: 'mcq_multiple',
      questionType: 'mcq',
      questionText: stem,
      options: inline.options.length >= 2 ? inline.options : [],
      tags: ['mcq_multiple'],
    };
  }

  if (optionCount >= 2 || inline.options.length >= 2) {
    return {
      subtype: 'mcq_single',
      questionType: 'mcq',
      questionText: stem,
      options: inline.options.length >= 2 ? inline.options : [],
      tags: ['mcq_single'],
    };
  }

  if (INTEGER_RE.test(lower)) {
    return {
      subtype: 'integer',
      questionType: 'numerical',
      questionText: stem.trim(),
      options: [],
      tags: ['integer_type'],
    };
  }

  if (NUMERICAL_RE.test(lower)) {
    return {
      subtype: 'numerical',
      questionType: 'numerical',
      questionText: stem.trim(),
      options: [],
      tags: ['numerical'],
    };
  }

  return {
    subtype: 'descriptive',
    questionType: 'descriptive',
    questionText: text.trim(),
    options: [],
    tags: ['descriptive'],
  };
}

export function extractImagesFromHtml(html: string): string[] {
  const { images } = cleanupWordHtml(html);
  return images;
}

export function sanitizePastedHtml(html: string): string {
  return cleanupWordHtml(html).html;
}
