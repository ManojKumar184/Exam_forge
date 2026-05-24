import { findDuplicateCandidate } from '../utils/duplicateHash.js';

export async function detectDuplicatesForQuestions(Question, questions) {
  const results = [];

  for (const q of questions) {
    if (!q.duplicateHash) {
      results.push({ ...q, duplicateOf: null, isDuplicate: false });
      continue;
    }
    const existing = await findDuplicateCandidate(Question, q.duplicateHash);
    if (existing) {
      results.push({
        ...q,
        duplicateOf: existing._id,
        isDuplicate: true,
        status: 'needs_review',
        extractionWarnings: [
          ...(q.extractionWarnings || []),
          'Possible duplicate of an existing question',
        ],
      });
    } else {
      results.push({ ...q, duplicateOf: null, isDuplicate: false });
    }
  }

  return results;
}
