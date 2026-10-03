const VALID_TYPES = new Set([
  'MCQ_SINGLE', 'MCQ_MULTIPLE', 'MCQ_MULTI', 'NUMERICAL_INTEGER', 'INTEGER', 'NUMERICAL', 'ASSERTION_REASON',
  'MATCH_FOLLOWING', 'MATCH_COLUMNS', 'COMPREHENSION', 'MATRIX_MATCH', 'DESCRIPTIVE',
  'TRUE_FALSE', 'FILL_BLANK', 'UNCLASSIFIED',
]);

const OBJECTIVE_TYPES = new Set([
  'MCQ_SINGLE', 'MCQ_MULTIPLE', 'MCQ_MULTI', 'TRUE_FALSE', 'FILL_BLANK',
  'NUMERICAL_INTEGER', 'NUMERICAL', 'INTEGER', 'MATCH_FOLLOWING', 'MATCH_COLUMNS', 'ASSERTION_REASON',
]);

export function validateQuestionObject(question) {
  const issues = [];

  if (!question.questionText?.trim()) issues.push('Question stem is empty');
  if (!VALID_TYPES.has(question.questionType) || !OBJECTIVE_TYPES.has(question.questionType)) {
    issues.push(question.questionType === 'UNCLASSIFIED'
      ? 'Question type could not be classified as a supported objective type'
      : `Unsupported Core v1 question type: ${question.questionType}`);
  }

  const isMcq = ['MCQ_SINGLE', 'MCQ_MULTI', 'MCQ_MULTIPLE', 'ASSERTION_REASON'].includes(question.questionType);
  if (isMcq && (question.options?.length || 0) < 2) issues.push('MCQ option count is below 2');
  if (isMcq && question.answerKey) {
    const labels = question.answerKey.split(',').map((label) => label.trim().toUpperCase()).filter(Boolean);
    const valid = new Set((question.options || []).map((_, index) => String.fromCharCode(65 + index)));
    for (const label of labels) {
      if (!valid.has(label)) issues.push(`Answer label ${label} does not match options`);
    }
  }
  const hasAnswer = Boolean(question.answerKey || question.answerText || question.correctOption !== null && question.correctOption !== undefined ||
    question.correctAnswers?.length || question.numericalAnswer !== null && question.numericalAnswer !== undefined);
  if (!hasAnswer && OBJECTIVE_TYPES.has(question.questionType)) {
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
