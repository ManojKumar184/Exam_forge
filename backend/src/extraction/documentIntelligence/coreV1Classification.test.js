import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuestion } from './questionTypeClassifier.js';
import { validateQuestionObject } from './validationEngine.js';
import { estimateDifficulty } from '../metadataClassifier.js';

function classify(stem, options = [], detectedAnswer = null) {
  return classifyQuestion(
    { passageBlocks: [], stemBlocks: [{ text: stem }], optionBlocks: [] },
    { options },
    detectedAnswer
  );
}

test('classifies supported objective question types', () => {
  assert.equal(classify('Choose the correct answer', [{ text: 'A' }, { text: 'B' }]).questionType, 'MCQ_SINGLE');
  assert.equal(classify('Select multiple correct options', [{ text: 'A' }, { text: 'B' }]).questionType, 'MCQ_MULTIPLE');
  assert.equal(classify('Mark this statement true or false').questionType, 'TRUE_FALSE');
  assert.equal(classify('Fill in the blank: 2 + 2 = ____').questionType, 'FILL_BLANK');
  assert.equal(classify('Match the following columns').questionType, 'MATCH_FOLLOWING');
});

test('keeps ambiguous questions for human review', () => {
  const result = classify('A statement with no reliable objective structure');
  assert.equal(result.questionType, 'UNCLASSIFIED');
  assert.ok(result.confidence < 0.5);

  const validation = validateQuestionObject({
    questionText: 'A statement with no reliable objective structure',
    questionType: result.questionType,
    options: [],
  });
  assert.equal(validation.valid, false);
  assert.equal(validation.status, 'needs_review');
});

test('source marks do not change estimated difficulty', () => {
  const question = { questionText: 'Explain the basic fact.', options: [] };
  assert.equal(estimateDifficulty({ ...question, marks: 1 }), estimateDifficulty({ ...question, marks: 10 }));
});
