import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuestion } from './questionTypeClassifier.js';
import { validateQuestionObject } from './validationEngine.js';
import { estimateDifficulty } from '../metadataClassifier.js';
import { assertCoreV1QuestionType, validateQuestionForApproval } from '../../services/questionService.js';

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
  const trueFalse = classify('Mark this statement true or false');
  assert.equal(trueFalse.questionType, 'MCQ_SINGLE');
  assert.equal(trueFalse.responseType, 'MCQ');
  assert.equal(trueFalse.subtype, 'TRUE_FALSE');
  assert.equal(classify('Fill in the blank: 2 + 2 = ____').questionType, 'UNCLASSIFIED');
  assert.equal(classify('Match the following columns').questionType, 'MCQ_SINGLE');
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

test('uses one numerical response type with an integer-response subtype', () => {
  assert.equal(classify('Give the numerical value to two decimal places.').questionType, 'NUMERICAL');
  const integer = classify('Give the answer as an integer.');
  assert.equal(integer.questionType, 'NUMERICAL');
  assert.equal(integer.subtype, 'INTEGER_RESPONSE');
  assert.equal(classify('Read the passage and explain your reasoning.').questionType, 'UNCLASSIFIED');
});

test('approval validation accepts a complete objective item and rejects descriptive or invalid-answer items', () => {
  const valid = {
    questionText: 'Choose the correct answer.', questionType: 'MCQ_SINGLE',
    options: [{ text: 'A' }, { text: 'B' }], correctOption: 1,
    syllabusMappings: [{ subjectId: 'subject', classId: 'class', chapterId: 'chapter', examPatternId: 'pattern' }],
  };
  assert.doesNotThrow(() => validateQuestionForApproval(valid));
  assert.throws(() => validateQuestionForApproval({ ...valid, questionType: 'DESCRIPTIVE' }), { code: 'UNSUPPORTED_QUESTION_TYPE' });
  assert.throws(() => validateQuestionForApproval({ ...valid, correctOption: 8 }), { code: 'INVALID_QUESTION_CONTENT' });
  assert.throws(() => validateQuestionForApproval({ ...valid, questionType: 'MCQ_SINGLE', options: [], correctOption: null }), { code: 'INVALID_QUESTION_CONTENT' });
});

test('Core v1 creation types exclude descriptive and preserve unknown material for review', () => {
  assert.equal(assertCoreV1QuestionType('NUMERICAL'), 'NUMERICAL');
  assert.equal(assertCoreV1QuestionType('UNCLASSIFIED'), 'UNCLASSIFIED');
  assert.equal(assertCoreV1QuestionType('COMPREHENSION'), 'UNCLASSIFIED');
  assert.equal(assertCoreV1QuestionType('DESCRIPTIVE'), 'UNCLASSIFIED');
});

test('source marks do not change estimated difficulty', () => {
  const question = { questionText: 'Explain the basic fact.', options: [] };
  assert.equal(estimateDifficulty({ ...question, marks: 1 }), estimateDifficulty({ ...question, marks: 10 }));
});
