import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibilityQuestionType, resolveQuestionTaxonomy } from './questionTaxonomy.js';
import { parseNumericalAnswer } from './numericalAnswer.js';

test('legacy forms project into the three canonical response types and controlled subtypes', () => {
  assert.deepEqual(resolveQuestionTaxonomy({ questionType: 'ASSERTION_REASON' }), { responseType: 'MCQ', subtype: 'ASSERTION_REASON' });
  assert.deepEqual(resolveQuestionTaxonomy({ questionType: 'MATCH_FOLLOWING' }), { responseType: 'MCQ', subtype: 'MATCH_THE_FOLLOWING' });
  assert.deepEqual(resolveQuestionTaxonomy({ questionType: 'NUMERICAL_INTEGER' }), { responseType: 'NUMERICAL', subtype: 'INTEGER_RESPONSE' });
  assert.equal(compatibilityQuestionType('MSQ'), 'MCQ_MULTIPLE');
});

test('safe numerical parser normalizes equivalent decimal, exponent, and power spellings', () => {
  for (const value of ['100', '100.0', '1e2', '10^2', '10²']) assert.equal(parseNumericalAnswer(value), 100);
  assert.equal(parseNumericalAnswer('1 / 0'), null);
  assert.equal(parseNumericalAnswer('1e9999'), null);
});
