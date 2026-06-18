import { detectQuestionType } from '../detectQuestionType.js';
import { normalizeQuestionType, getContextTypeForType } from '../../utils/questionTypeNormalizer.js';

export function classifyQuestion(segment, legacyBlock, detectedAnswer = null) {
  const text = [
    ...(segment.passageBlocks || []).map((block) => block.text),
    ...(segment.stemBlocks || []).map((block) => block.text),
    ...(segment.optionBlocks || []).map((block) => block.text),
  ].join('\n');
  const lower = text.toLowerCase();
  const optionCount = legacyBlock.options?.length || 0;

  let rawType = 'DESCRIPTIVE';
  let rawSubtype = 'descriptive';

  const isMatchFollowing = /match\s+(?:the\s+)?following|list-?\s*i\b|list-?\s*ii\b|column\s+i/i.test(text);
  
  if (lower.includes('four charges') || legacyBlock.questionNumber === 31 || legacyBlock.questionNumber === 3) {
    console.log(`[CLASSIFY DEBUG] Q${legacyBlock.questionNumber || 'unknown'} text length: ${text.length}`);
    console.log(`[CLASSIFY DEBUG] text contains 'match': ${isMatchFollowing}`);
    console.log(`[CLASSIFY DEBUG] text snippet: "${text.slice(0, 150)}..."`);
    console.log(`[CLASSIFY DEBUG] section: "${legacyBlock.section}"`);
    console.log(`[CLASSIFY DEBUG] tags: ${JSON.stringify(legacyBlock.tags)}`);
  }

  if (/assertion.*reason|reason.*assertion/i.test(text)) {
    rawType = 'ASSERTION_REASON';
    rawSubtype = 'assertion_reason';
  } else if (/matrix\s+match/i.test(text)) {
    rawType = 'MCQ_SINGLE';
    rawSubtype = 'matrix_match';
  } else if (isMatchFollowing) {
    rawType = 'MATCH_FOLLOWING';
    rawSubtype = 'match_following';
  } else if ((segment.passageBlocks || []).length || /comprehension|passage based|read the following passage/.test(lower)) {
    rawType = 'DESCRIPTIVE';
    rawSubtype = 'comprehension';
  } else if (detectedAnswer?.correctAnswers?.length > 1) {
    rawType = 'MCQ_MULTIPLE';
    rawSubtype = 'mcq_multi';
  } else if (legacyBlock.tags?.includes('typeOverride:MCQ_MULTIPLE') ||
             legacyBlock.sectionContext?.questionType === 'MCQ_MULTIPLE' ||
             /multiple\s*correct|one\s+or\s+more|more\s+than\s+one/i.test(legacyBlock.section || '')) {
    rawType = 'MCQ_MULTIPLE';
    rawSubtype = 'mcq_multi';
  } else if (/multiple correct|one or more correct|more than one/.test(lower)) {
    rawType = 'MCQ_MULTIPLE';
    rawSubtype = 'mcq_multi';
  } else if (optionCount >= 2) {
    rawType = 'MCQ_SINGLE';
    rawSubtype = 'mcq_single';
  } else if (optionCount === 0 &&
             (/numeric|integer|numerical/i.test(legacyBlock.section || '') ||
              legacyBlock.sectionContext?.questionType === 'NUMERICAL_INTEGER')) {
    rawType = 'NUMERICAL_INTEGER';
    rawSubtype = 'integer';
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
