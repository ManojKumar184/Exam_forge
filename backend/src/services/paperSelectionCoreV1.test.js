import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSufficientQuestionAvailability, buildQuestionFilter, seededRandom } from './paperSelectionService.js';

test('Core v1 paper pool only admits the canonical response taxonomy', () => {
  const filter = buildQuestionFilter({ class: 10 });
  assert.deepEqual(filter.responseType.$in, ['MCQ', 'MSQ', 'NUMERICAL']);
  assert.equal(filter.questionType, undefined);
  assert.deepEqual(buildQuestionFilter({ coreVersion: 'legacy' }).questionType, undefined);
});

test('paper group availability fails with a useful count instead of returning a short selection', () => {
  assert.throws(
    () => assertSufficientQuestionAvailability('Section A', 10, 7),
    (error) => error.code === 'INSUFFICIENT_QUESTIONS' && /Only 7 approved questions.*10 requested/.test(error.message)
  );
  assert.doesNotThrow(() => assertSufficientQuestionAvailability('Section A', 7, 7));
});

test('paper selection seed reproduces the same random sequence', () => {
  const first = seededRandom('exam-set-A');
  const second = seededRandom('exam-set-A');
  const other = seededRandom('exam-set-B');
  const firstSequence = Array.from({ length: 12 }, () => first());
  assert.deepEqual(firstSequence, Array.from({ length: 12 }, () => second()));
  assert.notDeepEqual(firstSequence, Array.from({ length: 12 }, () => other()));
});
