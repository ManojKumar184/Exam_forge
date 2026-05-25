import { normalizeQuestionText } from './duplicateHash.js';
import { stripLatexDelimiters } from '../extraction/latexUtils.js';

const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'in', 'on', 'for', 'to', 'and', 'or', 'with',
  'what', 'which', 'find', 'calculate', 'determine', 'following', 'question', 'answer',
]);

export function tokenizeForSimilarity(text) {
  const base = stripLatexDelimiters(normalizeQuestionText(text));
  return base
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .map((t) => t.replace(/[^\w]/g, ''))
    .filter(Boolean);
}

export function termFrequencyVector(tokens) {
  const map = new Map();
  for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
  return map;
}

export function cosineSimilarity(textA, textB) {
  const tokensA = tokenizeForSimilarity(textA);
  const tokensB = tokenizeForSimilarity(textB);
  if (!tokensA.length || !tokensB.length) return 0;

  const vecA = termFrequencyVector(tokensA);
  const vecB = termFrequencyVector(tokensB);
  const keys = new Set([...vecA.keys(), ...vecB.keys()]);

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const k of keys) {
    const a = vecA.get(k) || 0;
    const b = vecB.get(k) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function jaccardSimilarity(textA, textB) {
  const setA = new Set(tokenizeForSimilarity(textA));
  const setB = new Set(tokenizeForSimilarity(textB));
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union ? inter / union : 0;
}

export function combinedTextSimilarity(textA, textB) {
  return 0.6 * cosineSimilarity(textA, textB) + 0.4 * jaccardSimilarity(textA, textB);
}
