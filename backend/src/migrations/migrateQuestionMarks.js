import { Question } from '../models/Question.js';

/**
 * Idempotent migration to move legacy `marks` to `sourceMarks` on Question documents
 * and remove the `marks` field.
 */
export async function migrateQuestionMarks() {
  const result = await Question.collection.updateMany(
    { marks: { $exists: true } },
    [{ $set: { sourceMarks: { $ifNull: ['$sourceMarks', '$marks'] } } }, { $unset: 'marks' }],
  );
  return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
}
