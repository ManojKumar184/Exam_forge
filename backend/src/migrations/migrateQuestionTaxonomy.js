import { Question } from '../models/Question.js';

const groups = [
  { types: ['MCQ_SINGLE', 'mcq', 'MCQ', 'mcq_single'], responseType: 'MCQ', subtype: 'STANDARD' },
  { types: ['MCQ_MULTIPLE', 'MCQ_MULTI', 'mcq_multiple'], responseType: 'MSQ', subtype: 'STANDARD' },
  { types: ['TRUE_FALSE'], responseType: 'MCQ', subtype: 'STANDARD' },
  { types: ['ASSERTION_REASON', 'assertion_reason'], responseType: 'MCQ', subtype: 'ASSERTION_REASON' },
  { types: ['MATCH_FOLLOWING', 'MATCH_COLUMNS', 'match_following'], responseType: 'MCQ', subtype: 'MATCH_THE_FOLLOWING' },
  { types: ['NUMERICAL', 'numerical'], responseType: 'NUMERICAL', subtype: 'STANDARD' },
  { types: ['NUMERICAL_INTEGER', 'INTEGER', 'numerical_integer', 'integer'], responseType: 'NUMERICAL', subtype: 'STANDARD' },
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
  for (const [contextType, subtype] of [['COMPREHENSION', 'COMPREHENSION'], ['PARAGRAPH_BASED', 'PASSAGE_BASED'], ['STATEMENT_SET', 'STATEMENT_BASED']]) {
    const result = await Question.updateMany(
      { contextType, $or: [{ subtype: { $exists: false } }, { subtype: 'STANDARD' }] },
      { $set: { subtype } },
    );
    matched += result.modifiedCount || 0;
  }
  return { questionsUpdated: matched };
}
