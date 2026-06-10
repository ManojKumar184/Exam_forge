/**
 * Answer Detector — extracts structured answer data from question blocks.
 *
 * Supports patterns present in Physics_cleaned_dataset.docx and common exam formats:
 *   Answer: B
 *   Answer: A,C
 *   Answer: A,B,D
 *   Answer: 125
 *   Ans: B
 *   Correct Answer: C
 *   Correct Option: D
 *   Correct Answers: A,B
 */

/**
 * @typedef {Object} AnswerResult
 * @property {number|null} correctOption - Index of single correct option (0=A, 1=B, etc.)
 * @property {number[]} correctAnswers - Array of correct option indices
 * @property {string|null} answerText - Raw answer text (e.g., "B", "A,C", "125")
 * @property {number|null} numericalAnswer - Parsed numeric answer
 * @property {'letter'|'multi_letter'|'numerical'|null} answerType - Detected answer type
 * @property {number} confidence - Detection confidence (0-1)
 * @property {string[]} warnings - Any warnings
 */

const ANSWER_PATTERNS = [
  // Answer: B / Answer: A,C / Answer: A,B,D / Answer: B (single)
  /(?:^|\n)\s*(?:Answer|Ans|Correct\s+Answer|Correct\s+Option)\s*[:：]\s*(.+?)(?:\n|$)/i,

  // (Answer: B) — parenthetical
  /\(?(?:Answer|Ans|Correct\s+Answer|Correct\s+Option)\s*[:：]\s*(.+?)\)/i,
];

const LETTER_ANSWER_RE = /^[A-Ja-j](?:\s*,\s*[A-Ja-j])*$/;
const NUMERIC_ANSWER_RE = /^-?\d+(?:\.\d+)?$/;

/**
 * Detect answers within a block of text (question stem + explanation).
 *
 * @param {string} text - The combined question and explanation text
 * @returns {AnswerResult}
 */
export function detectAnswer(text) {
  if (!text || !text.trim()) {
    return {
      correctOption: null,
      correctAnswers: [],
      answerText: null,
      numericalAnswer: null,
      answerType: null,
      confidence: 0,
      warnings: ['No text provided for answer detection'],
    };
  }

  const warnings = [];

  // 1. Try all answer patterns
  let answerMatch = null;
  let rawValue = null;

  for (const pattern of ANSWER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      answerMatch = match;
      rawValue = match[1].trim();
      break;
    }
  }

  if (!rawValue) {
    return {
      correctOption: null,
      correctAnswers: [],
      answerText: null,
      numericalAnswer: null,
      answerType: null,
      confidence: 0,
      warnings: ['No answer pattern found'],
    };
  }

  // 2. Strip trailing punctuation that isn't part of the answer
  rawValue = rawValue.replace(/[\.\)\]\}]+$/, '').trim();

  // 3. Determine answer type
  // Check for comma-separated letters (multi-correct): A, B, C or A,B,C
  const multiLetterMatch = rawValue.match(/^\s*([A-Ja-j])\s*,\s*([A-Ja-j](?:\s*,\s*[A-Ja-j])*)\s*$/);
  if (multiLetterMatch) {
    const allLetters = [multiLetterMatch[1], ...multiLetterMatch[2].split(/\s*,\s*/)];
    const indices = allLetters.map(l => l.toUpperCase().charCodeAt(0) - 65);
    return {
      correctOption: null,
      correctAnswers: indices,
      answerText: rawValue.toUpperCase(),
      numericalAnswer: null,
      answerType: 'multi_letter',
      confidence: 0.95,
      warnings: [],
    };
  }

  // Check for "A" format (single letter, potentially with an extra period)
  const singleLetterMatch = rawValue.match(/^\s*([A-Ja-j])\s*\.?\s*$/);
  if (singleLetterMatch) {
    const index = singleLetterMatch[1].toUpperCase().charCodeAt(0) - 65;
    return {
      correctOption: index,
      correctAnswers: [index],
      answerText: singleLetterMatch[1].toUpperCase(),
      numericalAnswer: null,
      answerType: 'letter',
      confidence: 0.98,
      warnings: [],
    };
  }

  // Check for numeric answer: 125, -42, 3.14
  const numericMatch = rawValue.match(NUMERIC_ANSWER_RE);
  if (numericMatch) {
    const num = Number(numericMatch[0]);
    return {
      correctOption: null,
      correctAnswers: [],
      answerText: rawValue,
      numericalAnswer: num,
      answerType: 'numerical',
      confidence: 0.95,
      warnings: [],
    };
  }

  // Fallback: treat as text answer (for MATCH_FOLLOWING, ASSERTION_REASON, etc.)
  return {
    correctOption: null,
    correctAnswers: [],
    answerText: rawValue,
    numericalAnswer: null,
    answerType: null,
    confidence: 0.5,
    warnings: [`Uncertain answer format: "${rawValue}"`],
  };
}

/**
 * Detect answer from a raw line.
 * Useful when the answer is on its own dedicated line (e.g., in [solution] blocks).
 *
 * @param {string} line - A single line of text
 * @returns {AnswerResult|null} - null if the line doesn't contain an answer pattern
 */
export function detectAnswerInLine(line) {
  if (!line) return null;
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Quick check: does it look like an answer line?
  const hasPrefix = /^(?:Answer|Ans|Correct|Correct Answer|Correct Option)\b/i.test(trimmed);
  if (!hasPrefix) return null;

  return detectAnswer(trimmed);
}
