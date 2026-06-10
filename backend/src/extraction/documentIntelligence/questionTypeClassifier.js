import { detectQuestionType } from '../detectQuestionType.js';
import { normalizeQuestionType, getContextTypeForType } from '../../utils/questionTypeNormalizer.js';

export function classifyQuestion(segment, legacyBlock) {
  const text = [
    ...(segment.passageBlocks || []).map((block) => block.text),
    ...(segment.stemBlocks || []).map((block) => block.text),
    ...(segment.optionBlocks || []).map((block) => block.text),
  ].join('\n');
  const lower = text.toLowerCase();
  const optionCount = legacyBlock.options?.length || 0;

  let rawType = 'DESCRIPTIVE';
  let rawSubtype = 'descriptive';

  if (/assertion.*reason|reason.*assertion/i.test(text)) {
    rawType = 'ASSERTION_REASON';
    rawSubtype = 'assertion_reason';
  } else if (/matrix\s+match/i.test(text)) {
    rawType = 'MCQ_SINGLE';
    rawSubtype = 'matrix_match';
  } else if (/match\s+(?:the\s+)?following|column\s+i|list\s+i/i.test(text)) {
    rawType = 'MATCH_FOLLOWING';
    rawSubtype = 'match_following';
  } else if ((segment.passageBlocks || []).length || /comprehension|passage based|read the following passage/.test(lower)) {
    rawType = 'DESCRIPTIVE';
    rawSubtype = 'comprehension';
  } else if (/multiple correct|one or more correct|more than one/.test(lower)) {
    rawType = 'MCQ_MULTIPLE';
    rawSubtype = 'mcq_multi';
  } else if (optionCount >= 2) {
    rawType = 'MCQ_SINGLE';
    rawSubtype = 'mcq_single';
  } else if (/integer/.test(lower)) {
    rawType = 'NUMERICAL_INTEGER';
    rawSubtype = 'integer';
  } else if (/numerical|decimal|round\s+off/.test(lower)) {
    rawType = 'NUMERICAL_INTEGER';
    rawSubtype = 'numerical';
  } else {
    const fallback = detectQuestionType(legacyBlock);
    rawType = fallback.questionType;
    rawSubtype = fallback.subtype;
  }

  return {
    questionType: normalizeQuestionType(rawType),
    subtype: rawSubtype,
    contextType: getContextTypeForType(rawType) || null,
    confidence: 0.86,
  };
}
