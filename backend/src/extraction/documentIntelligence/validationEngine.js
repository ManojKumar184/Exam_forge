const VALID_TYPES = new Set([
  'MCQ_SINGLE', 'MCQ_MULTI', 'INTEGER', 'NUMERICAL', 'ASSERTION_REASON',
  'MATCH_COLUMNS', 'COMPREHENSION', 'MATRIX_MATCH', 'DESCRIPTIVE',
]);

export function validateQuestionObject(question) {
  const issues = [];

  if (!question.questionText?.trim()) issues.push('Question stem is empty');
  if (!VALID_TYPES.has(question.questionType)) issues.push(`Unsupported question type: ${question.questionType}`);

  const isMcq = ['MCQ_SINGLE', 'MCQ_MULTI', 'ASSERTION_REASON'].includes(question.questionType);
  if (isMcq && (question.options?.length || 0) < 2) issues.push('MCQ option count is below 2');
  if (isMcq && question.answerKey) {
    const labels = question.answerKey.split(',').map((label) => label.trim().toUpperCase()).filter(Boolean);
    const valid = new Set((question.options || []).map((_, index) => String.fromCharCode(65 + index)));
    for (const label of labels) {
      if (!valid.has(label)) issues.push(`Answer label ${label} does not match options`);
    }
  }
  if (!question.answerKey && !['DESCRIPTIVE', 'COMPREHENSION'].includes(question.questionType)) {
    issues.push('Answer missing');
  }
  for (const url of question.questionImages || []) {
    if (typeof url !== 'string' || !url.trim()) issues.push('Invalid image reference');
  }
  if (question.hasTable && !question.renderingMetadata?.tables?.length) {
    issues.push('Question marked as table-backed but no table model is attached');
  }
  if (question.hasEquation && question.mathPreservationConfidence < 0.6) {
    issues.push('Equation preservation confidence is low');
  }

  return {
    valid: issues.length === 0,
    issues,
    status: issues.length ? 'needs_review' : question.status || 'pending',
  };
}
