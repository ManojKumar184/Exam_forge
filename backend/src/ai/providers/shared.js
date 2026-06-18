/**
 * shared.js — Shared utility functions for AI providers.
 *
 * Extracted from duplicate implementations in HuggingFaceProvider and OllamaProvider.
 */

/**
 * Extract the first JSON object or array from a string that may contain
 * markdown fences, conversational prefix/suffix text, etc.
 */
export function extractJSON(str) {
  const firstBracket = str.indexOf('[');
  const lastBracket = str.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return str.slice(firstBracket, lastBracket + 1);
  }
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return str.slice(firstBrace, lastBrace + 1);
  }
  return str;
}

/**
 * Extract answer text from a question object in various formats.
 */
export function extractAnswer(q) {
  return (
    q.answerText ||
    (q.correctOption !== undefined ? `Option ${String.fromCharCode(65 + Number(q.correctOption))}` : '') ||
    (q.numericalAnswer !== undefined ? String(q.numericalAnswer) : '') ||
    (q.correctAnswers?.length ? q.correctAnswers.join(', ') : '')
  );
}
