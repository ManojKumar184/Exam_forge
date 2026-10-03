import { Question } from '../models/Question.js';
import { QuestionBank } from '../models/QuestionBank.js';
import { Counter } from '../models/Counter.js';

export async function initializeQuestionSequenceIds() {
  const questions = await Question.find({ $or: [{ serialId: { $exists: false } }, { serialId: null }] }).sort({ createdAt: 1 });
  if (!questions.length) return { modifiedCount: 0 };

  const counter = await Counter.findOne({ _id: 'questions' });
  let nextSeq = counter ? counter.seq + 1 : 1000;
  for (const question of questions) {
    question.serialId = nextSeq++;
    await question.save();
  }
  await Counter.findOneAndUpdate({ _id: 'questions' }, { $set: { seq: nextSeq - 1 } }, { upsert: true });
  return { modifiedCount: questions.length };
}

export async function migrateWorkspaceQuestions() {
  const systemBank = await QuestionBank.findOne({ type: 'system', name: 'System Global Bank' }).select('_id').lean();
  const bankFilter = systemBank
    ? { bankIds: systemBank._id }
    : { bankIds: { $exists: true, $not: { $size: 0 } } };
  const visibility = await Question.updateMany(
    { ...bankFilter, $or: [{ isPrivate: { $ne: false } }, { visibility: { $ne: 'public' } }] },
    { $set: { isPrivate: false, visibility: 'public' } },
  );
  const unowned = await Question.find({ ownerId: null, createdBy: { $ne: null } });
  for (const question of unowned) {
    question.ownerId = question.createdBy;
    if (!question.bankIds?.length) {
      question.isPrivate = true;
      question.visibility = 'private';
    }
    await question.save();
  }
  return { visibilityModified: visibility.modifiedCount, ownerModified: unowned.length };
}
