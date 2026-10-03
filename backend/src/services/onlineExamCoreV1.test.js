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
