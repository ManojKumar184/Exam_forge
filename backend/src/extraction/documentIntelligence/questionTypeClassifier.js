import { detectQuestionType } from '../detectQuestionType.js';
import { normalizeQuestionType, getContextTypeForType } from '../../utils/questionTypeNormalizer.js';
import { compatibilityQuestionType, resolveQuestionTaxonomy } from '../../utils/questionTaxonomy.js';

export function classifyQuestion(segment, legacyBlock, detectedAnswer = null) {
  const text = [
    ...(segment.passageBlocks || []).map((block) => block.text),
    ...(segment.stemBlocks || []).map((block) => block.text),
    ...(segment.optionBlocks || []).map((block) => block.text),
  ].join('\n');
  const lower = text.toLowerCase();
  const optionCount = legacyBlock.options?.length || 0;

  let rawType = 'UNCLASSIFIED';
  let rawSubtype = 'unclassified';

  const isMatchFollowing = /match\s+(?:the\s+)?following|list-?\s*i\b|list-?\s*ii\b|column\s+i/i.test(text);
  
  if (/assertion.*reason|reason.*assertion/i.test(text)) {
    rawType = 'MCQ_SINGLE';
    rawSubtype = 'assertion_reason';
  } else if (isMatchFollowing) {
    rawType = 'MCQ_SINGLE';
    rawSubtype = 'match_following';
  } else if (/\btrue\s*\/\s*false\b|\btrue or false\b/i.test(text) ||
             (optionCount === 2 && ['true', 'false'].every(value =>
               (legacyBlock.options || []).some(option => option.text?.trim().toLowerCase() === value)))) {
    rawType = 'MCQ_SINGLE';
    rawSubtype = 'true_false';
  } else if (optionCount === 0 && /_{2,}|\[\s*\]|\bfill\s+in\s+the\s+blank/i.test(text)) {
    rawType = 'UNCLASSIFIED';
    rawSubtype = 'unclassified';
  } else if ((segment.passageBlocks || []).length || /comprehension|passage based|read the following passage/.test(lower)) {
    const multipleCorrect = (detectedAnswer?.correctAnswers?.length || 0) > 1 || /multiple correct|one or more|more than one/.test(`${lower} ${legacyBlock.section || ''}`.toLowerCase());
    rawType = detectedAnswer?.numericalAnswer != null || /answer as (?:an )?integer|numerical value/.test(lower)
      ? 'NUMERICAL'
      : optionCount >= 2 ? (multipleCorrect ? 'MCQ_MULTIPLE' : 'MCQ_SINGLE') : 'UNCLASSIFIED';
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
             (/integer/i.test(legacyBlock.section || '') ||
              legacyBlock.sectionContext?.questionType === 'NUMERICAL_INTEGER')) {
    rawType = 'NUMERICAL';
    rawSubtype = 'integer_response';
  } else if (/integer/.test(lower)) {
    rawType = 'NUMERICAL';
    rawSubtype = 'integer_response';
  } else if (/numerical|decimal|round\s+off/.test(lower)) {
    rawType = 'NUMERICAL';
    rawSubtype = 'numerical';
  } else {
    const fallback = detectQuestionType(legacyBlock);
    if (fallback.questionType !== 'DESCRIPTIVE') {
      rawType = fallback.questionType;
      rawSubtype = fallback.subtype;
    }
  }

  const taxonomy = resolveQuestionTaxonomy({ questionType: rawType, subtype: rawSubtype, contextType: getContextTypeForType(rawType) });
  const isSupported = Boolean(taxonomy.responseType);

  return {
    questionType: isSupported ? compatibilityQuestionType(taxonomy.responseType) : 'UNCLASSIFIED',
    responseType: isSupported ? taxonomy.responseType : null,
    subtype: taxonomy.subtype,
    contextType: getContextTypeForType(rawType) || null,
    confidence: isSupported ? 0.86 : 0.2,
  };
}
