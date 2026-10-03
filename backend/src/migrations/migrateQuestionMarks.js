import { Question } from '../models/Question.js';

/**
 * Idempotent migration to move legacy `marks` to `sourceMarks` on Question documents
 * and remove the `marks` field.
 */
export async function migrateQuestionMarks() {
  const legacyQuestions = await Question.find({ marks: { $exists: true, $ne: null } });
  for (const q of legacyQuestions) {
    if (q.sourceMarks == null && q.marks != null) {
      q.sourceMarks = q.marks;
    }
    q.marks = undefined;
    await q.save();
  }
}
