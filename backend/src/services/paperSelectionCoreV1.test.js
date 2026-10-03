import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSufficientQuestionAvailability, buildQuestionFilter } from './paperSelectionService.js';

test('Core v1 paper pool is objective-only and retains supported legacy aliases', () => {
  const filter = buildQuestionFilter({ class: 10 });
  assert.ok(filter.questionType.$in.includes('TRUE_FALSE'));
  assert.ok(filter.questionType.$in.includes('FILL_BLANK'));
  assert.ok(filter.questionType.$in.includes('ASSERTION_REASON'));
  assert.ok(!filter.questionType.$in.includes('DESCRIPTIVE'));
  assert.deepEqual(buildQuestionFilter({ coreVersion: 'legacy' }).questionType, undefined);
});

test('paper group availability fails with a useful count instead of returning a short selection', () => {
  assert.throws(
    () => assertSufficientQuestionAvailability('Section A', 10, 7),
    (error) => error.code === 'INSUFFICIENT_QUESTIONS' && /Only 7 approved questions.*10 requested/.test(error.message)
  );
  assert.doesNotThrow(() => assertSufficientQuestionAvailability('Section A', 7, 7));
});
