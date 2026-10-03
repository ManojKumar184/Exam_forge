import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalContentFromLegacy,
  createCanonicalQuestionContent,
  reconcileCanonicalQuestionContent,
  CANONICAL_QUESTION_CONTENT_VERSION,
} from './canonicalQuestionContent.js';
import { mapQuestion } from './questionMapper.js';

test('canonical question content preserves ordered rich blocks and source fidelity fields', () => {
  const content = createCanonicalQuestionContent({
    stem: [
      { type: 'text', text: 'Find the value ' },
      { type: 'equation', latex: 'x^2', omml: '<m:oMath/>' },
      { type: 'table', rows: [[{ text: 'cell', rowspan: 2 }]] },
      { type: 'image', assetUrl: '/assets/figure.png' },
      { type: 'embedded', originalAssetUrl: '/assets/ole.bin', warning: 'Unconverted OLE object' },
    ],
    options: [{ label: 'A', content: [{ type: 'text', text: 'one' }] }],
    provenance: { sourceFile: 'paper.docx', sourceOrder: 4 },
    validation: { needsReview: true },
  });

  assert.equal(content.version, CANONICAL_QUESTION_CONTENT_VERSION);
  assert.deepEqual(content.stem.map((block) => block.type), ['text', 'equation', 'table', 'image', 'embedded']);
  assert.equal(content.stem[1].omml, '<m:oMath/>');
  assert.equal(content.stem[4].originalAssetUrl, '/assets/ole.bin');
  assert.equal(content.provenance.sourceOrder, 4);
  assert.equal(content.validation.needsReview, true);
});

test('legacy question fields map to canonical content without dropping options or equations', () => {
  const content = canonicalContentFromLegacy({
    question_text: 'Legacy stem',
    question_latex: 'x+1',
    options: [{ text: 'answer', latex: '2', image: '/option.png' }],
    explanation: 'because',
  });

  assert.equal(content.stem[0].text, 'Legacy stem');
  assert.deepEqual(content.options[0].content.map((block) => block.type), ['text', 'equation', 'image']);
  assert.equal(content.explanation[0].text, 'because');
});

test('canonical content rejects unknown versions and malformed blocks', () => {
  assert.throws(() => createCanonicalQuestionContent({ version: 'v9', stem: [], options: [] }), /Unsupported/);
  assert.throws(() => createCanonicalQuestionContent({ stem: [null], options: [] }), /objects/);
});

test('Question API projection serves canonical stem and option blocks to existing renderers', () => {
  const mapped = mapQuestion({
    _id: 'question-id',
    questionText: 'legacy projection',
    questionType: 'MCQ_SINGLE',
    options: [{ text: 'legacy option' }],
    canonicalContent: createCanonicalQuestionContent({
      stem: [{ type: 'text', text: 'canonical stem' }, { type: 'table', rows: [[{ text: 'cell' }]] }],
      options: [{ label: 'A', content: [{ type: 'equation', latex: 'x=1' }] }],
    }),
  });

  assert.equal(mapped.content_blocks[0].text, 'canonical stem');
  assert.equal(mapped.options[0].contentBlocks[0].latex, 'x=1');
});

test('legacy text edits reconcile without dropping canonical tables or equations', () => {
  const existing = {
    questionText: 'Old stem',
    source: 'docx',
    sourceFile: 'trusted.docx',
    canonicalContent: createCanonicalQuestionContent({
      stem: [{ type: 'text', text: 'Old stem' }, { type: 'equation', latex: 'x=2' }, { type: 'table', rows: [[{ text: 'data' }]] }],
      options: [{ label: 'A', content: [{ type: 'text', text: 'old' }] }],
      explanation: [{ type: 'equation', latex: 'y=1' }],
      provenance: { sourceFile: 'trusted.docx' },
      validation: { status: 'pending' },
    }),
  };
  const reconciled = reconcileCanonicalQuestionContent(existing, {
    questionText: 'New stem',
    options: [{ text: 'new' }],
  });

  assert.equal(reconciled.stem[0].text, 'New stem');
  assert.deepEqual(reconciled.stem.slice(1).map((block) => block.type), ['equation', 'table']);
  assert.equal(reconciled.options[0].content[0].text, 'new');
  assert.equal(reconciled.explanation[0].latex, 'y=1');
  assert.equal(reconciled.provenance.sourceFile, 'trusted.docx');
  assert.equal(reconciled.validation.status, 'pending');
});

test('canonical content updates cannot overwrite server provenance or validation state', () => {
  const existing = {
    source: 'docx',
    sourceFile: 'trusted.docx',
    canonicalContent: createCanonicalQuestionContent({
      stem: [{ type: 'text', text: 'Original' }],
      provenance: { sourceFile: 'trusted.docx' },
      validation: { status: 'pending' },
    }),
  };
  const updated = reconcileCanonicalQuestionContent(existing, {
    canonicalContent: createCanonicalQuestionContent({
      stem: [{ type: 'text', text: 'Edited' }],
      provenance: { sourceFile: 'forged.docx' },
      validation: { status: 'approved' },
    }),
  });
  assert.equal(updated.stem[0].text, 'Edited');
  assert.equal(updated.provenance.sourceFile, 'trusted.docx');
  assert.equal(updated.validation.status, 'pending');
});
