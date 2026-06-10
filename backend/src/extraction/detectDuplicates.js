import { findDuplicateCandidate, computeDuplicateHash } from '../utils/duplicateHash.js';
import { combinedTextSimilarity } from '../utils/textSimilarity.js';
import { equationSimilarity } from '../utils/equationFingerprint.js';

const SEMANTIC_THRESHOLD = 0.88;
const EQUATION_THRESHOLD = 0.85;

/**
 * Find semantic or equation-similar existing question.
 */
async function findSemanticDuplicate(Question, question, options = {}) {
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

export async function detectDuplicatesForQuestions(Question, questions) {
  const results = [];

  for (const q of questions) {
    let duplicateOf = null;
    let isDuplicate = false;
    const warnings = [...(q.extractionWarnings || [])];
    let duplicateMethod = null;
    let duplicateScore = null;

    if (q.duplicateHash) {
      const existing = await findDuplicateCandidate(Question, q.duplicateHash);
      if (existing) {
        duplicateOf = existing._id;
        isDuplicate = true;
        duplicateMethod = 'hash';
        duplicateScore = 1;
        warnings.push('Exact duplicate hash match with existing question');
      }
    }

    if (!isDuplicate) {
      const semantic = await findSemanticDuplicate(Question, q);
      if (semantic?.existing) {
        duplicateOf = semantic.existing._id;
        isDuplicate = true;
        duplicateMethod = semantic.method;
        duplicateScore = Number(semantic.score.toFixed(3));
        warnings.push(
          `Probable duplicate (${semantic.method}, score ${duplicateScore}) — review before approval`
        );
      }
    }

    results.push({
      ...q,
      duplicateOf,
      isDuplicate,
      status: isDuplicate ? 'needs_review' : q.status,
      extractionWarnings: warnings,
      renderingMetadata: {
        ...(q.renderingMetadata || {}),
        duplicateDetection: isDuplicate
          ? { method: duplicateMethod, score: duplicateScore }
          : null,
      },
    });
  }

  return results;
}

export async function detectDuplicatesInScopes(Question, q, user, options = {}) {
  const hash = q.duplicateHash || computeDuplicateHash(q.questionText);
  
  const scopeFilter = {
    $or: [
      // 1. Faculty Workspace (private questions owned by user)
      { ownerId: user._id, isPrivate: true },
      // 2. Faculty Question Banks & Workspace (all questions owned/created by the user)
      { ownerId: user._id },
      { createdBy: user._id },
      // 3. Institution Banks & Public Banks (non-private questions visible to faculty)
      { isPrivate: false, visibility: { $in: ['institution', 'public', 'faculty_bank'] } }
    ]
  };

  // 1. Check exact hash match in scopes
  let exact = null;
  if (hash) {
    exact = await Question.findOne({ duplicateHash: hash, ...scopeFilter })
      .select('_id questionText status')
      .lean();
  }

  if (exact) {
    const match = {
      id: exact._id.toString(),
      question_text: exact.questionText,
      confidence: 1.0,
      method: 'exact'
    };
    return {
      isDuplicate: true,
      duplicateOf: exact._id,
      duplicateMethod: 'hash',
      duplicateScore: 1,
      possibleMatches: [match]
    };
  }

  // 2. Check semantic/equation similarity matches in scopes
  const filter = {
    status: { $in: ['approved', 'pending', 'needs_review'] },
    ...scopeFilter
  };
  if (q.subjectId) filter.subjectId = q.subjectId;

  const candidates = await Question.find(filter)
    .select('_id questionText questionLatex questionType duplicateHash')
    .sort({ createdAt: -1 })
    .limit(options.candidateLimit ?? 100)
    .lean();

  const text = q.questionText || '';
  const latex = q.questionLatex || null;

  const possibleMatches = [];
  const SEMANTIC_THRESHOLD = 0.70; // lower threshold for display so we show potential matches!
  const EQUATION_THRESHOLD = 0.70;

  for (const c of candidates) {
    const eqSim = equationSimilarity(text, c.questionText, latex, c.questionLatex);
    if (eqSim >= EQUATION_THRESHOLD) {
      possibleMatches.push({
        id: c._id.toString(),
        question_text: c.questionText,
        confidence: Number(eqSim.toFixed(3)),
        method: 'equation'
      });
    } else {
      const textSim = combinedTextSimilarity(text, c.questionText);
      if (textSim >= SEMANTIC_THRESHOLD) {
        possibleMatches.push({
          id: c._id.toString(),
          question_text: c.questionText,
          confidence: Number(textSim.toFixed(3)),
          method: 'semantic'
        });
      }
    }
  }

  // Sort possible matches by confidence descending
  possibleMatches.sort((a, b) => b.confidence - a.confidence);

  if (possibleMatches.length > 0) {
    const best = possibleMatches[0];
    return {
      isDuplicate: best.confidence >= 0.85, // only flag as duplicate automatically above 0.85
      duplicateOf: best.id,
      duplicateMethod: best.method,
      duplicateScore: best.confidence,
      possibleMatches: possibleMatches.slice(0, 5) // limit to top 5
    };
  }

  return {
    isDuplicate: false,
    duplicateOf: null,
    duplicateMethod: null,
    duplicateScore: 0,
    possibleMatches: []
  };
}

