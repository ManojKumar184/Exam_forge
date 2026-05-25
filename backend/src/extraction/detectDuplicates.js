import { findDuplicateCandidate } from '../utils/duplicateHash.js';
import { findSemanticDuplicate } from './semanticDuplicates.js';

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
