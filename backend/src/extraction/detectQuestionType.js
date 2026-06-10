import { countOptionMarkers, hasMcqOptionPattern } from './optionParser.js';
import { normalizeQuestionType, getContextTypeForType } from '../utils/questionTypeNormalizer.js';

const MCQ_MULTIPLE_RE =
  /one\s+or\s+more\s+correct|multiple\s+correct|more\s+than\s+one\s+(?:of\s+the\s+)?(?:options?|choices?)|select\s+all\s+that\s+apply/i;

const INTEGER_RE =
  /integer\s+(?:value|answer|type)|answer\s+in\s+integer|integer\s+between/i;

const NUMERICAL_RE =
  /numerical\s+(?:value|answer|type)|numeric\s+answer|decimal\s+places|round\s+off/i;

const MATCH_RE = /match\s+(?:the\s+)?following|list-?\s*i\b|list-?\s*ii\b|column\s+i\b/i;

const COMPREHENSION_RE =
  /comprehension|passage\s*based|read\s+the\s+following\s+passage|based\s+on\s+the\s+above\s+passage/i;

const ASSERTION_REASON_RE =
  /assertion\s*[:\-–—]?\s*(?:reason|reasoning)?/i;

/**
 * Canonical type mapping: maps internal subtypes to canonical question types.
 */
const CANONICAL_TYPE_MAP = {
  'mcq_single': 'MCQ_SINGLE',
  'mcq_multiple': 'MCQ_MULTIPLE',
  'integer': 'NUMERICAL_INTEGER',
  'numerical': 'NUMERICAL_INTEGER',
  'integer_type': 'NUMERICAL_INTEGER',
  'numerical_integer': 'NUMERICAL_INTEGER',
  'match_following': 'MATCH_FOLLOWING',
  'assertion_reason': 'ASSERTION_REASON',
  'comprehension': 'COMPREHENSION',
  'descriptive': 'DESCRIPTIVE',
  'short_answer': 'DESCRIPTIVE',
  'long_answer': 'DESCRIPTIVE',
  'mcq_incomplete': 'MCQ_SINGLE',
};

/**
 * Map a subtype to its canonical question type.
 */
export function toCanonicalType(subtype) {
  return CANONICAL_TYPE_MAP[subtype] || subtype || 'DESCRIPTIVE';
}

/**
 * Detect question type + subtype tags for coaching exam formats.
 * Returns canonical types: MCQ_SINGLE, MCQ_MULTIPLE, NUMERICAL_INTEGER, etc.
 */
export function detectQuestionType(block) {
  const lineText = (block.lines || []).join('\n');
  const optionText = (block.options || []).map((o) => o?.text || '').join('\n');
  const fullText = `${lineText}\n${optionText}`.trim();
  const lower = fullText.toLowerCase();

  const optionCount = Math.max(
    (block.options || []).filter((o) => o?.text?.trim()).length,
    countOptionMarkers(fullText)
  );

  const tags = [...(block.tags || [])];

  // ASSERTION_REASON (check before comprehension/match to be more specific)
  if (ASSERTION_REASON_RE.test(lower) && /reason\s*[:\-–—]?\s*/i.test(lower)) {
    tags.push('assertion_reason');
    return { questionType: 'ASSERTION_REASON', tags, subtype: 'assertion_reason' };
  }

  if (COMPREHENSION_RE.test(lower)) {
    tags.push('comprehension');
    return { questionType: 'COMPREHENSION', tags, subtype: 'comprehension', contextType: 'COMPREHENSION' };
  }

  if (MATCH_RE.test(lower)) {
    tags.push('match_following');
    return { questionType: 'MATCH_FOLLOWING', tags, subtype: 'match_following' };
  }

  if (MCQ_MULTIPLE_RE.test(lower)) {
    tags.push('mcq_multiple');
    if (optionCount >= 2 || hasMcqOptionPattern(fullText)) {
      return { questionType: 'MCQ_MULTIPLE', tags, subtype: 'mcq_multiple' };
    }
  }

  if (optionCount >= 2 || hasMcqOptionPattern(fullText)) {
    return { questionType: 'MCQ_SINGLE', tags, subtype: 'mcq_single' };
  }

  // Merge NUMERICAL and INTEGER into NUMERICAL_INTEGER
  if (INTEGER_RE.test(lower) || /^\s*\d+\s*$/.test(lineText.trim())) {
    tags.push('numerical_integer');
    return { questionType: 'NUMERICAL_INTEGER', tags, subtype: 'numerical_integer' };
  }

  if (
    NUMERICAL_RE.test(lower) ||
    /\b\d+(\.\d+)?\s*(cm|m|kg|g|mol|j|n|v|a|w|hz|s)\b/i.test(fullText)
  ) {
    tags.push('numerical_integer');
    return { questionType: 'NUMERICAL_INTEGER', tags, subtype: 'numerical_integer' };
  }

  if (/\([a-fA-F]\)/.test(fullText) && countOptionMarkers(fullText) === 1) {
    tags.push('possible_mcq_verify');
    return { questionType: 'MCQ_SINGLE', tags, subtype: 'mcq_incomplete' };
  }

  return { questionType: 'DESCRIPTIVE', tags, subtype: 'descriptive' };
}

export function detectQuestionTypeNormalized(block) {
  const result = detectQuestionType(block);
  return {
    ...result,
    questionType: normalizeQuestionType(result.questionType),
    contextType: getContextTypeForType(result.questionType) || result.contextType || null,
  };
}
