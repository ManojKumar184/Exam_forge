import { Question } from '../models/Question.js';

export async function migrateQuestionGroups() {
  await Question.collection.createIndex(
    { contextGroupId: 1, contextGroupPosition: 1 },
    { name: 'question_context_group_order' },
  );
  return { index: 'question_context_group_order', legacyContextBackfill: 'not_inferred_without_source-boundary_evidence' };
}
