import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAnswer } from './testService.js';

test('online scoring reuses canonical TRUE_FALSE and FILL_BLANK question answers', () => {
  assert.deepEqual(
    scoreAnswer({ selectedOption: 0 }, { questionType: 'TRUE_FALSE', correctOption: 0 }, 2, 0.5),
    { isCorrect: true, marks: 2, skipped: false }
  );
  assert.deepEqual(
    scoreAnswer({ textAnswer: '  water  ' }, { questionType: 'FILL_BLANK', answerText: 'Water' }, 2, 0.5),
    { isCorrect: true, marks: 2, skipped: false }
  );
  assert.deepEqual(
    scoreAnswer({ textAnswer: 'oil' }, { questionType: 'FILL_BLANK', answerText: 'Water' }, 2, 0.5),
    { isCorrect: false, marks: -0.5, skipped: false }
  );
});

test('online scoring requires the complete correct set for multiple-answer MCQ', () => {
  const question = { questionType: 'MCQ_MULTIPLE', correctAnswers: ['A', 'C'] };
  assert.deepEqual(scoreAnswer({ selectedOptions: [2, 0] }, question, 4, 1), { isCorrect: true, marks: 4, skipped: false });
  assert.deepEqual(scoreAnswer({ selectedOptions: [0] }, question, 4, 1), { isCorrect: false, marks: -1, skipped: false });
});

test('online scoring uses canonical answers when compatibility scalars disagree', () => {
  assert.deepEqual(
    scoreAnswer({ selectedOption: 1 }, {
      questionType: 'MCQ_SINGLE', correctOption: 0,
      canonicalContent: { answer: 1, options: [{ label: 'A' }, { label: 'B' }] },
    }, 2),
    { isCorrect: true, marks: 2, skipped: false },
  );
  assert.deepEqual(
    scoreAnswer({ numericalAnswer: 2.2 }, {
      questionType: 'NUMERICAL', numericalAnswer: 8, numericalTolerance: 0,
      canonicalContent: { answer: { value: 2, tolerance: 0.25 } },
    }, 3),
    { isCorrect: true, marks: 3, skipped: false },
  );
});

test('online grading accepts the exact snake_case question snapshot returned to clients', () => {
  assert.deepEqual(
    scoreAnswer({ selectedOption: 1 }, {
      question_type: 'MCQ_SINGLE',
      correct_option: 0,
      canonical_content: { answer: 1, options: [{ label: 'A' }, { label: 'B' }] },
    }, 3, 0.5),
    { isCorrect: true, marks: 3, skipped: false },
  );
});
