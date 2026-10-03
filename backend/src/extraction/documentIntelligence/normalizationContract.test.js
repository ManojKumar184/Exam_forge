import test from 'node:test';
import assert from 'node:assert/strict';
import { createSemanticDocument } from './semanticDocumentModel.js';
import { validateRawDocumentIR, validateNormalizedQuestionBatch } from './normalizationContract.js';

const raw = createSemanticDocument({
  sourceType: 'docx',
  blocks: [{ id: 'b1', text: 'Which is correct?' }, { id: 'b2', type: 'list_item', text: 'A' }],
});

test('RawDocumentIR preserves ordered source evidence and rejects duplicate IDs', () => {
  assert.equal(validateRawDocumentIR(raw).success, true);
  assert.equal(validateRawDocumentIR({ ...raw, blocks: [raw.blocks[0], raw.blocks[0]] }).success, false);
});

test('NormalizedQuestionIR requires supported types and source-linked evidence', () => {
  const valid = { questions: [{ sourceEvidence: ['b1', 'b2'], type: 'MCQ_SINGLE', content: { blocks: [{ type: 'text', text: 'Which is correct?' }] }, options: [{ label: 'A', text: 'A' }, { label: 'B', text: 'B' }], answer: 'A' }] };
  assert.equal(validateNormalizedQuestionBatch(valid, raw).success, true);
  assert.equal(validateNormalizedQuestionBatch({ questions: [{ ...valid.questions[0], sourceEvidence: ['missing'] }] }, raw).success, false);
  assert.equal(validateNormalizedQuestionBatch({ questions: [{ ...valid.questions[0], type: 'DESCRIPTIVE' }] }, raw).success, false);
});

test('UNCLASSIFIED normalized questions cannot be marked approved or pending', () => {
  const item = { sourceEvidence: ['b1'], type: 'UNCLASSIFIED', status: 'pending', content: { blocks: [{ type: 'text', text: 'ambiguous' }] } };
  assert.equal(validateNormalizedQuestionBatch({ questions: [item] }, raw).success, false);
  assert.equal(validateNormalizedQuestionBatch({ questions: [{ ...item, status: 'needs_review' }] }, raw).success, true);
});
