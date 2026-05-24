import crypto from 'crypto';

export function normalizeQuestionText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s$+\-*/=().,]/g, '')
    .trim();
}

export function computeDuplicateHash(text) {
  const normalized = normalizeQuestionText(text);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function findDuplicateCandidate(Question, hash, excludeId = null) {
  if (!hash) return null;
  const filter = { duplicateHash: hash };
  if (excludeId) filter._id = { $ne: excludeId };
  return Question.findOne(filter).select('_id questionText status');
}
