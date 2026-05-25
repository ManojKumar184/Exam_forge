import { combinedTextSimilarity } from '../utils/textSimilarity.js';
import { equationSimilarity } from '../utils/equationFingerprint.js';
import { findDuplicateCandidate, computeDuplicateHash } from '../utils/duplicateHash.js';

const SEMANTIC_THRESHOLD = 0.88;
const EQUATION_THRESHOLD = 0.85;

/**
 * Find semantic or equation-similar existing question.
 */
export async function findSemanticDuplicate(Question, question, options = {}) {
  const hash = question.duplicateHash || computeDuplicateHash(question.questionText);
  const exact = await findDuplicateCandidate(Question, hash, options.excludeId);
  if (exact) {
    return { existing: exact, method: 'hash', score: 1 };
  }

  const filter = { status: { $in: ['approved', 'pending', 'needs_review'] } };
  if (question.subjectId) filter.subjectId = question.subjectId;
  if (options.excludeId) filter._id = { $ne: options.excludeId };

  const candidates = await Question.find(filter)
    .select('_id questionText questionLatex questionType duplicateHash')
    .sort({ createdAt: -1 })
    .limit(options.candidateLimit ?? 150)
    .lean();

  const text = question.questionText || '';
  const latex = question.questionLatex || null;

  let best = null;
  let bestScore = 0;
  let method = null;

  for (const c of candidates) {
    const eqSim = equationSimilarity(text, c.questionText, latex, c.questionLatex);
    if (eqSim >= EQUATION_THRESHOLD && eqSim > bestScore) {
      bestScore = eqSim;
      best = c;
      method = 'equation';
    }
    const textSim = combinedTextSimilarity(text, c.questionText);
    if (textSim >= SEMANTIC_THRESHOLD && textSim > bestScore) {
      bestScore = textSim;
      best = c;
      method = 'semantic';
    }
  }

  if (best) {
    return { existing: best, method, score: bestScore };
  }
  return null;
}
