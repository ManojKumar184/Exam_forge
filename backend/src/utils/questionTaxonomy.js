const SUBTYPES = new Set([
  'STANDARD', 'ASSERTION_REASON', 'MATCH_THE_FOLLOWING', 'COMPREHENSION',
  'PASSAGE_BASED', 'STATEMENT_BASED',
  'INTEGER_RESPONSE',
  'TRUE_FALSE',
]);

const TYPE_TO_TAXONOMY = {
  MCQ: { responseType: 'MCQ', subtype: 'STANDARD' },
  MCQ_SINGLE: { responseType: 'MCQ', subtype: 'STANDARD' },
  MCQ_MULTIPLE: { responseType: 'MSQ', subtype: 'STANDARD' },
  MCQ_MULTI: { responseType: 'MSQ', subtype: 'STANDARD' },
  TRUE_FALSE: { responseType: 'MCQ', subtype: 'TRUE_FALSE' },
  ASSERTION_REASON: { responseType: 'MCQ', subtype: 'ASSERTION_REASON' },
  MATCH_FOLLOWING: { responseType: 'MCQ', subtype: 'MATCH_THE_FOLLOWING' },
  MATCH_COLUMNS: { responseType: 'MCQ', subtype: 'MATCH_THE_FOLLOWING' },
  NUMERICAL: { responseType: 'NUMERICAL', subtype: 'STANDARD' },
  NUMERICAL_INTEGER: { responseType: 'NUMERICAL', subtype: 'INTEGER_RESPONSE' },
  INTEGER: { responseType: 'NUMERICAL', subtype: 'INTEGER_RESPONSE' },
};

/** Maps legacy representations into the response/presentation taxonomy. */
export function resolveQuestionTaxonomy({ questionType, responseType, subtype, contextType } = {}) {
  const legacy = TYPE_TO_TAXONOMY[String(questionType || '').trim().toUpperCase()];
  const resolvedResponseType = responseType || legacy?.responseType || null;
  const contextSubtype = {
    COMPREHENSION: 'COMPREHENSION',
    PARAGRAPH_BASED: 'PASSAGE_BASED',
    STATEMENT_SET: 'STATEMENT_BASED',
  }[String(contextType || '').trim().toUpperCase()];
  const resolvedSubtype = String(subtype || legacy?.subtype || contextSubtype || 'STANDARD').trim().toUpperCase();
  return {
    responseType: ['MCQ', 'MSQ', 'NUMERICAL'].includes(resolvedResponseType) ? resolvedResponseType : null,
    subtype: SUBTYPES.has(resolvedSubtype) ? resolvedSubtype : 'STANDARD',
  };
}

export const QUESTION_SUBTYPES = Object.freeze([...SUBTYPES]);

export function compatibilityQuestionType(responseType) {
  if (responseType === 'MCQ') return 'MCQ_SINGLE';
  if (responseType === 'MSQ') return 'MCQ_MULTIPLE';
  if (responseType === 'NUMERICAL') return 'NUMERICAL';
  return 'UNCLASSIFIED';
}
