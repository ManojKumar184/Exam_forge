/**
 * Question Type Normalizer — centralized canonical type mapping.
 *
 * Canonical types (ONLY these should be stored internally):
 *   MCQ_SINGLE, MCQ_MULTIPLE, NUMERICAL_INTEGER, MATCH_FOLLOWING,
 *   ASSERTION_REASON, DESCRIPTIVE
 *
 * Legacy → Canonical mappings:
 *   mcq → MCQ_SINGLE
 *   MCQ_MULTI → MCQ_MULTIPLE
 *   INTEGER → NUMERICAL_INTEGER
 *   NUMERICAL → NUMERICAL_INTEGER
 *   MATCH_COLUMNS → MATCH_FOLLOWING
 *   SHORT_ANSWER → DESCRIPTIVE
 *   LONG_ANSWER → DESCRIPTIVE
 *   DESCRIPTIVE → DESCRIPTIVE
 *
 * Complex assessment patterns (COMPREHENSION, CASE_STUDY, MATRIX_MATCH,
 * TRUE_FALSE, NESTED_OPTION_MCQ, PARAGRAPH_BASED, STATEMENT_SET) are preserved
 * as context_type metadata and NOT as canonical question types.
 */

/**
 * Collection of all known question types used for validation/lookup.
 * Includes both canonical and legacy for backward compatibility.
 */
export const ALL_QUESTION_TYPES = [
  // Canonical types (6)
  'MCQ_SINGLE',
  'MCQ_MULTIPLE',
  'NUMERICAL_INTEGER',
  'MATCH_FOLLOWING',
  'ASSERTION_REASON',
  'DESCRIPTIVE',

  // Legacy backward-compatible types
  'mcq',
  'MCQ',
  'MCQ_MULTI',
  'descriptive',
  'numerical',
  'NUMERICAL',
  'integer',
  'INTEGER',
  'MATCH_COLUMNS',
  'SHORT_ANSWER',
  'LONG_ANSWER',

  // Complex assessment patterns (reserved for context_type)
  'COMPREHENSION',
  'CASE_STUDY',
  'MATRIX_MATCH',
  'TRUE_FALSE',
  'NESTED_OPTION_MCQ',
  'PARAGRAPH_BASED',
  'STATEMENT_SET',
];

/**
 * Legacy → Canonical mapping for backward compatibility.
 * Keys can be lowercase or uppercase.
 */
const LEGACY_TO_CANONICAL = {
  'mcq': 'MCQ_SINGLE',
  'mcq_single': 'MCQ_SINGLE',
  'mcq_incomplete': 'MCQ_SINGLE',
  'mcq_multiple': 'MCQ_MULTIPLE',
  'mcq_multi': 'MCQ_MULTIPLE',
  'integer': 'NUMERICAL_INTEGER',
  'integer_type': 'NUMERICAL_INTEGER',
  'numerical': 'NUMERICAL_INTEGER',
  'numerical_integer': 'NUMERICAL_INTEGER',
  'match_following': 'MATCH_FOLLOWING',
  'match_columns': 'MATCH_FOLLOWING',
  'assertion_reason': 'ASSERTION_REASON',
  'descriptive': 'DESCRIPTIVE',
  'short_answer': 'DESCRIPTIVE',
  'long_answer': 'DESCRIPTIVE',
  'comprehension': 'DESCRIPTIVE',
  'case_study': 'DESCRIPTIVE',
  'matrix_match': 'DESCRIPTIVE',
  'true_false': 'MCQ_SINGLE',
  'nested_option_mcq': 'MCQ_SINGLE',
  'paragraph_based': 'DESCRIPTIVE',
  'statement_set': 'DESCRIPTIVE',
};

/**
 * Normalize ANY question type to its canonical form.
 * Returns canonical string or null if unknown.
 */
export function normalizeQuestionType(type) {
  if (!type) return 'DESCRIPTIVE';
  const key = type.toLowerCase().trim();
  return LEGACY_TO_CANONICAL[key] || 'DESCRIPTIVE';
}

/**
 * Normalize a batch of question types to canonical.
 */
export function normalizeQuestionTypes(types) {
  if (!Array.isArray(types)) return [];
  return types.map(t => normalizeQuestionType(t));
}

/**
 * Check if a type is in the canonical set.
 */
export function isCanonicalType(type) {
  if (!type) return false;
  const upper = type.toUpperCase().trim();
  const canonicalSet = new Set([
    'MCQ_SINGLE', 'MCQ_MULTIPLE', 'NUMERICAL_INTEGER',
    'MATCH_FOLLOWING', 'ASSERTION_REASON', 'DESCRIPTIVE',
  ]);
  return canonicalSet.has(upper);
}

/**
 * Get the category for grading/scoring purposes.
 * Returns: 'mcq' | 'numerical' | 'descriptive'
 */
export function getQuestionCategory(type) {
  const canonical = normalizeQuestionType(type);
  if (['MCQ_SINGLE', 'MCQ_MULTIPLE', 'ASSERTION_REASON'].includes(canonical)) {
    return 'mcq';
  }
  if (canonical === 'NUMERICAL_INTEGER') {
    return 'numerical';
  }
  return 'descriptive';
}

/**
 * Check if a complex assessment pattern (context type) should NOT be
 * stored as a canonical question type.
 */
export function getContextTypeForType(type) {
  if (!type) return null;
  const upper = type.toUpperCase().trim();
  const contextTypes = new Set([
    'COMPREHENSION', 'CASE_STUDY', 'MATRIX_MATCH', 'TRUE_FALSE',
    'NESTED_OPTION_MCQ', 'PARAGRAPH_BASED', 'STATEMENT_SET',
    'MATCH_FOLLOWING', 'ASSERTION_REASON',
  ]);
  if (contextTypes.has(upper)) return upper;
  return null;
}

/**
 * Format a question type for display.
 */
export function formatQuestionType(type) {
  const canonical = normalizeQuestionType(type);
  const displayMap = {
    'MCQ_SINGLE': 'MCQ (Single)',
    'MCQ_MULTIPLE': 'MCQ (Multiple)',
    'NUMERICAL_INTEGER': 'Numerical',
    'MATCH_FOLLOWING': 'Match the Following',
    'ASSERTION_REASON': 'Assertion/Reason',
    'DESCRIPTIVE': 'Descriptive',
  };
  return displayMap[canonical] || canonical;
}
