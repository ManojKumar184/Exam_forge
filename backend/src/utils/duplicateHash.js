import crypto from 'crypto';
import { canonicalContentFromLegacy } from './canonicalQuestionContent.js';
import { resolveQuestionTaxonomy } from './questionTaxonomy.js';
import { parseNumericalAnswer } from './numericalAnswer.js';

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

function normalizeBlock(block) {
  if (!block || typeof block !== 'object') return normalizeQuestionText(String(block ?? ''));
  if (block.type === 'text') return { type: 'text', text: normalizeQuestionText(block.text) };
  if (block.type === 'equation') return { type: 'equation', latex: String(block.latex || '').replace(/\s+/g, '') };
  if (block.type === 'image') return { type: 'image', checksum: block.checksum || block.sha256 || block.assetUrl || block.url || null };
  if (block.type === 'table') return { type: 'table', rows: (block.rows || []).map((row) => row.map((cell) => normalizeQuestionText(typeof cell === 'string' ? cell : cell?.text || ''))) };
  return { type: block.type || 'embedded', payload: JSON.stringify(block.payload ?? block).replace(/\s+/g, ' ').trim() };
}

function normalizeAnswer(answer, responseType) {
  if (responseType === 'NUMERICAL') {
    const raw = answer && typeof answer === 'object' ? answer.value : answer;
    const value = parseNumericalAnswer(raw);
    return { value, comparisonPolicy: answer?.comparisonPolicy || 'EXACT', tolerance: Number(answer?.tolerance || 0) };
  }
  if (Array.isArray(answer)) return answer.map(String).sort();
  return answer == null ? null : String(answer).normalize('NFKC').trim().toUpperCase();
}

export function computeQuestionDuplicateHash(question = {}) {
  const content = question.canonicalContent || question.canonical_content || canonicalContentFromLegacy(question);
  const taxonomy = resolveQuestionTaxonomy(question);
  const material = {
    responseType: taxonomy.responseType,
    subtype: taxonomy.subtype,
    contextType: question.contextType || question.context_type || null,
    stem: [...(question.sharedContext || question.shared_context || []), ...(content.stem || [])].map(normalizeBlock),
    options: (content.options || []).map((option) => (option.content || []).map(normalizeBlock)),
    answer: normalizeAnswer(content.answer, taxonomy.responseType),
  };
  const serialized = JSON.stringify(material);
  if (!material.stem.length && !material.options.length) return null;
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

export async function findDuplicateCandidate(Question, hash, excludeId = null) {
  if (!hash) return null;
  const filter = { duplicateHash: hash, status: 'approved', duplicatePolicy: { $ne: 'SYSTEM_TEST_ALLOW' } };
  if (excludeId) filter._id = { $ne: excludeId };
  return Question.findOne(filter).select('_id questionText status');
}
