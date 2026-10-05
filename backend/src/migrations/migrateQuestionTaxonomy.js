import { Question } from '../models/Question.js';

const groups = [
  { types: ['MCQ_SINGLE', 'mcq', 'MCQ', 'mcq_single'], responseType: 'MCQ', subtype: 'STANDARD' },
  { types: ['MCQ_MULTIPLE', 'MCQ_MULTI', 'mcq_multiple'], responseType: 'MSQ', subtype: 'STANDARD' },
  { types: ['TRUE_FALSE'], responseType: 'MCQ', subtype: 'STANDARD' },
  { types: ['ASSERTION_REASON', 'assertion_reason'], responseType: 'MCQ', subtype: 'ASSERTION_REASON' },
  { types: ['MATCH_FOLLOWING', 'MATCH_COLUMNS', 'match_following'], responseType: 'MCQ', subtype: 'MATCH_THE_FOLLOWING' },
  { types: ['NUMERICAL', 'numerical'], responseType: 'NUMERICAL', subtype: 'STANDARD' },
  { types: ['NUMERICAL_INTEGER', 'INTEGER', 'numerical_integer', 'integer'], responseType: 'NUMERICAL', subtype: 'INTEGER_RESPONSE' },
];

export async function migrateQuestionTaxonomy() {
  let matched = 0;
  for (const group of groups) {
    const result = await Question.updateMany(
      { questionType: { $in: group.types }, $or: [{ responseType: { $exists: false } }, { responseType: null }] },
      { $set: { responseType: group.responseType, subtype: group.subtype } },
    );
    matched += result.modifiedCount || 0;
  }
  const integerResponse = await Question.updateMany(
    { questionType: { $in: ['NUMERICAL_INTEGER', 'INTEGER', 'numerical_integer', 'integer'] }, responseType: 'NUMERICAL', $or: [{ subtype: { $exists: false } }, { subtype: 'STANDARD' }] },
    { $set: { subtype: 'INTEGER_RESPONSE' } },
  );
  matched += integerResponse.modifiedCount || 0;
  const trueFalse = await Question.updateMany(
    { questionType: 'TRUE_FALSE', responseType: 'MCQ', $or: [{ subtype: { $exists: false } }, { subtype: 'STANDARD' }] },
    { $set: { subtype: 'TRUE_FALSE' } },
  );
  matched += trueFalse.modifiedCount || 0;
  for (const [contextType, subtype] of [['COMPREHENSION', 'COMPREHENSION'], ['PARAGRAPH_BASED', 'PASSAGE_BASED'], ['STATEMENT_SET', 'STATEMENT_BASED']]) {
    const result = await Question.updateMany(
      { contextType, $or: [{ subtype: { $exists: false } }, { subtype: 'STANDARD' }] },
      { $set: { subtype } },
    );
    matched += result.modifiedCount || 0;
  }
  const tolerancePolicy = await Question.updateMany(
    { numericalTolerance: { $gt: 0 }, $or: [{ numericalComparisonPolicy: { $exists: false } }, { numericalComparisonPolicy: null }] },
    { $set: { numericalComparisonPolicy: 'TOLERANCE' } },
  );
  matched += tolerancePolicy.modifiedCount || 0;
  const exactPolicy = await Question.updateMany(
    { $or: [{ numericalComparisonPolicy: { $exists: false } }, { numericalComparisonPolicy: null }] },
    { $set: { numericalComparisonPolicy: 'EXACT' } },
  );
  matched += exactPolicy.modifiedCount || 0;
  return { questionsUpdated: matched };
}
