/**
 * Validation Engine — centralized question validation with structured rules.
 *
 * Each question type has specific validation requirements:
 * - MCQ_SINGLE: Must have options, exactly one answer
 * - MCQ_MULTIPLE / MCQ_MULTI: Must have options, one or more answers
 * - NUMERICAL_INTEGER: Must have numeric answer
 * - MATCH_FOLLOWING / MATCH_COLUMNS: Must have matching pairs
 * - ASSERTION_REASON: Must have assertion and reason
 * - SHORT_ANSWER / LONG_ANSWER / DESCRIPTIVE: Must have text
 *
 * Questions failing validation should enter review workflow (status: needs_review)
 * rather than being inserted directly.
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the question passes all validation rules
 * @property {string[]} issues - List of validation issues/warnings
 * @property {'valid'|'needs_review'} suggestedStatus - Suggested status based on validation
 * @property {number} confidence - Validation confidence (0-1)
 */

const VALIDATION_RULES = {
  MCQ_SINGLE: {
    requiresOptions: true,
    requiresAnswer: true,
    requiresExactAnswers: 1,
    minOptions: 2,
    description: 'Single choice MCQ — must have 2+ options and exactly 1 correct answer',
  },
  MCQ_MULTIPLE: {
    requiresOptions: true,
    requiresAnswer: true,
    requiresMinAnswers: 1,
    minOptions: 2,
    description: 'Multiple choice MCQ — must have 2+ options and 1+ correct answers',
  },
  NUMERICAL_INTEGER: {
    requiresNumericAnswer: true,
    description: 'Numerical/Integer — must have a numeric answer',
  },
  ASSERTION_REASON: {
    requiresAssertionReason: true,
    requiresOptions: true,
    minOptions: 2,
    description: 'Assertion-Reason — must contain assertion and reason text',
  },
  MATCH_FOLLOWING: {
    requiresMatchingPairs: true,
    description: 'Match the Following — must contain matching pairs',
  },
  DESCRIPTIVE: {
    requiresText: true,
    description: 'Descriptive — must contain question text',
  },
};

// Legacy alias rules (map to canonical during validation)
const LEGACY_RULE_ALIASES = {
  MCQ_MULTI: 'MCQ_MULTIPLE',
  NUMERICAL: 'NUMERICAL_INTEGER',
  INTEGER: 'NUMERICAL_INTEGER',
  MATCH_COLUMNS: 'MATCH_FOLLOWING',
  SHORT_ANSWER: 'DESCRIPTIVE',
  LONG_ANSWER: 'DESCRIPTIVE',
};

/**
 * Normalize a question type to its canonical form for validation lookup.
 * Maps legacy/alternate types to their canonical equivalents.
 */
function normalizeTypeForValidation(type) {
  if (!type) return null;
  const upper = type.toUpperCase().trim();

  const typeMap = {
    MCQ: 'MCQ_SINGLE',
    MCQ_SINGLE: 'MCQ_SINGLE',
    MCQ_MULTI: 'MCQ_MULTIPLE',
    MCQ_MULTIPLE: 'MCQ_MULTIPLE',
    NUMERICAL: 'NUMERICAL_INTEGER',
    INTEGER: 'NUMERICAL_INTEGER',
    NUMERICAL_INTEGER: 'NUMERICAL_INTEGER',
    ASSERTION_REASON: 'ASSERTION_REASON',
    MATCH_COLUMNS: 'MATCH_FOLLOWING',
    MATCH_FOLLOWING: 'MATCH_FOLLOWING',
    COMPREHENSION: 'DESCRIPTIVE',
    PARAGRAPH_BASED: 'DESCRIPTIVE',
    STATEMENT_SET: 'DESCRIPTIVE',
    MATRIX_MATCH: 'MCQ_SINGLE',
    TRUE_FALSE: 'MCQ_SINGLE',
    NESTED_OPTION_MCQ: 'MCQ_SINGLE',
    CASE_STUDY: 'DESCRIPTIVE',
    DESCRIPTIVE: 'DESCRIPTIVE',
    SHORT_ANSWER: 'DESCRIPTIVE',
    LONG_ANSWER: 'DESCRIPTIVE',
  };

  return typeMap[upper] || null;
}

/**
 * Detect if question text contains assertion/reason structure.
 */
function hasAssertionAndReason(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const hasAssertion = /assertion\s*[::\-–—]/.test(lower);
  const hasReason = /reason\s*[::\-–—]/.test(lower);
  return hasAssertion && hasReason;
}

/**
 * Detect if question text contains matching pairs structure.
 */
function hasMatchingPairs(text, options) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const hasMatchKeywords = /match\s+(?:the\s+)?following|column\s+(?:i|ii|iii|iv)|list[- ]?[iI]|list[- ]?[iI][iI]/i.test(lower);
  if (hasMatchKeywords) return true;

  // Check if options look like matching pairs (contain "→" or " - ")
  if (options && options.length >= 2) {
    const pairOptions = options.filter(o => {
      const t = (o.text || '').toLowerCase();
      return t.includes('→') || t.includes('--') || /^[a-z]\)\s*.+/i.test(t);
    });
    if (pairOptions.length >= 2) return true;
  }

  return false;
}

/**
 * Count how many answers are present in the question.
 */
function countAnswers(question) {
  let count = 0;

  if (question.correctOption !== null && question.correctOption !== undefined && question.correctOption >= 0) {
    count++;
  }
  if (question.answerText || question.answerKey) {
    // Don't double-count if correctOption was already counted
    if (count === 0) count++;
  }
  if (Array.isArray(question.correctAnswers) && question.correctAnswers.length > 0) {
    count = Math.max(count, question.correctAnswers.length);
  }
  if (question.numericalAnswer !== null && question.numericalAnswer !== undefined) {
    count++;
  }

  return count;
}

/**
 * Validate a single question object.
 *
 * @param {Object} question - The question object to validate
 * @returns {ValidationResult} Validation result with issues and suggested status
 */
export function validateQuestion(question) {
  const issues = [];
  const type = normalizeTypeForValidation(question.questionType);
  const rules = VALIDATION_RULES[type];

  if (!rules) {
    return {
      valid: true,
      issues: [],
      suggestedStatus: 'pending',
      confidence: 0.7,
    };
  }

  const questionText = question.questionText || '';
  const options = question.options || [];
  const nonEmptyOptions = options.filter(o => o && (o.text || '').trim());

  // Text requirement
  if (rules.requiresText && !questionText.trim()) {
    issues.push('Question text is empty');
  }

  // Options requirement
  if (rules.requiresOptions) {
    if (nonEmptyOptions.length < (rules.minOptions || 2)) {
      issues.push(`${type} requires at least ${rules.minOptions || 2} options, found ${nonEmptyOptions.length}`);
    }
  }

  // Answer requirement
  if (rules.requiresAnswer) {
    const answerCount = countAnswers(question);
    if (answerCount === 0) {
      issues.push(`${type} requires at least one correct answer`);
    }
    if (rules.requiresExactAnswers && answerCount !== rules.requiresExactAnswers) {
      issues.push(`${type} requires exactly ${rules.requiresExactAnswers} correct answer, found ${answerCount}`);
    }
  }

  // Min answers requirement
  if (rules.requiresMinAnswers) {
    const answerCount = countAnswers(question);
    if (answerCount < rules.requiresMinAnswers) {
      issues.push(`${type} requires at least ${rules.requiresMinAnswers} correct answer(s), found ${answerCount}`);
    }
  }

  // Numeric answer requirement
  if (rules.requiresNumericAnswer) {
    if (question.numericalAnswer === null || question.numericalAnswer === undefined || isNaN(Number(question.numericalAnswer))) {
      issues.push(`${type} requires a numeric answer`);
    }
  }

  // Assertion-Reason check
  if (rules.requiresAssertionReason) {
    if (!hasAssertionAndReason(questionText)) {
      issues.push('ASSERTION_REASON must contain both assertion and reason in the question text');
    }
  }

  // Matching pairs check
  if (rules.requiresMatchingPairs) {
    if (!hasMatchingPairs(questionText, options)) {
      issues.push('MATCH_FOLLOWING must contain matching pair indicators (columns, lists, or arrows)');
    }
  }

  // General quality checks
  if (questionText.length < 5) {
    issues.push('Question text is too short (less than 5 characters)');
  }

  if (options.length > 0) {
    const emptyOptions = options.filter(o => !(o.text || '').trim());
    if (emptyOptions.length > 0) {
      issues.push(`${emptyOptions.length} option(s) have empty text`);
    }
  }

  const valid = issues.length === 0;
  const suggestedStatus = valid ? 'pending' : 'needs_review';
  const confidence = valid ? 0.9 : Math.max(0.1, 1.0 - (issues.length * 0.2));

  return {
    valid,
    issues,
    suggestedStatus,
    confidence,
  };
}

/**
 * Validate a batch of questions.
 *
 * @param {Object[]} questions - Array of question objects to validate
 * @returns {ValidationResult[]} Array of validation results
 */
export function validateQuestionBatch(questions) {
  return questions.map(q => validateQuestion(q));
}

/**
 * Validate and enrich a question with validation metadata.
 *
 * @param {Object} question - The question object to validate and enrich
 * @returns {Object} The enriched question with validation metadata attached
 */
export function validateAndEnrichQuestion(question) {
  const validation = validateQuestion(question);
  return {
    ...question,
    validationResult: validation,
    status: validation.suggestedStatus === 'needs_review'
      ? (question.status === 'approved' ? 'approved' : 'needs_review')
      : question.status || 'pending',
    extractionWarnings: [
      ...(question.extractionWarnings || []),
      ...validation.issues,
    ],
  };
}
