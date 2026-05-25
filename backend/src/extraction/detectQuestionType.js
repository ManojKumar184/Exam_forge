import { countOptionMarkers, hasMcqOptionPattern } from './optionParser.js';

const MCQ_MULTIPLE_RE =
  /one\s+or\s+more\s+correct|multiple\s+correct|more\s+than\s+one\s+(?:of\s+the\s+)?(?:options?|choices?)|select\s+all\s+that\s+apply/i;

const INTEGER_RE =
  /integer\s+(?:value|answer|type)|answer\s+in\s+integer|integer\s+between/i;

const NUMERICAL_RE =
  /numerical\s+(?:value|answer|type)|numeric\s+answer|decimal\s+places|round\s+off/i;

const MATCH_RE = /match\s+(?:the\s+)?following|list-?\s*i\b|list-?\s*ii\b|column\s+i\b/i;

const COMPREHENSION_RE =
  /comprehension|passage\s*based|read\s+the\s+following\s+passage|based\s+on\s+the\s+above\s+passage/i;

/**
 * Detect question type + subtype tags for coaching exam formats.
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

  if (COMPREHENSION_RE.test(lower)) {
    tags.push('comprehension');
    return { questionType: 'descriptive', tags, subtype: 'comprehension' };
  }

  if (MATCH_RE.test(lower)) {
    tags.push('match_following');
    return { questionType: 'descriptive', tags, subtype: 'match' };
  }

  if (MCQ_MULTIPLE_RE.test(lower)) {
    tags.push('mcq_multiple');
    if (optionCount >= 2 || hasMcqOptionPattern(fullText)) {
      return { questionType: 'mcq', tags, subtype: 'mcq_multiple' };
    }
  }

  if (optionCount >= 2 || hasMcqOptionPattern(fullText)) {
    return { questionType: 'mcq', tags, subtype: 'mcq_single' };
  }

  if (INTEGER_RE.test(lower) || /^\s*\d+\s*$/.test(lineText.trim())) {
    tags.push('integer_type');
    return { questionType: 'numerical', tags, subtype: 'integer' };
  }

  if (
    NUMERICAL_RE.test(lower) ||
    /\b\d+(\.\d+)?\s*(cm|m|kg|g|mol|j|n|v|a|w|hz|s)\b/i.test(fullText)
  ) {
    return { questionType: 'numerical', tags, subtype: 'numerical' };
  }

  if (/\([a-dA-D]\)/.test(fullText) && countOptionMarkers(fullText) === 1) {
    tags.push('possible_mcq_verify');
    return { questionType: 'mcq', tags, subtype: 'mcq_incomplete' };
  }

  return { questionType: 'descriptive', tags, subtype: 'descriptive' };
}
