import { Question } from '../models/Question.js';
import { QuestionBank } from '../models/QuestionBank.js';
import { computeQuestionDuplicateHash } from '../utils/duplicateHash.js';

export async function migrateQuestionDuplicates() {
  const systemBanks = await QuestionBank.find({ type: 'system_test' }).select('_id').lean();
  const systemBankIds = new Set(systemBanks.map((bank) => String(bank._id)));
  const approvedByHash = new Map();
  let operations = [];
  let updated = 0;
  let demotedDuplicates = 0;
  const cursor = Question.find({}).sort({ createdAt: 1, _id: 1 }).lean().cursor();
  for await (const question of cursor) {
    const hash = computeQuestionDuplicateHash(question);
    const questionBankIds = (question.bankIds || []).map(String);
    const isSystem = questionBankIds.length > 0 && questionBankIds.every((id) => systemBankIds.has(id));
    const update = { duplicateHash: hash, duplicatePolicy: isSystem ? 'SYSTEM_TEST_ALLOW' : 'PROHIBIT' };
    if (!isSystem && hash && question.status === 'approved') {
      const firstId = approvedByHash.get(hash);
      if (firstId) {
        update.status = 'needs_review';
        update.duplicateOf = firstId;
        demotedDuplicates += 1;
      } else approvedByHash.set(hash, question._id);
    }
    operations.push({ updateOne: { filter: { _id: question._id }, update: { $set: update } } });
    if (operations.length >= 500) {
      const result = await Question.bulkWrite(operations, { ordered: false });
      updated += result.modifiedCount || 0;
      operations = [];
    }
  }
  if (operations.length) {
    const result = await Question.bulkWrite(operations, { ordered: false });
    updated += result.modifiedCount || 0;
  }
  await Question.collection.createIndex(
    { duplicateHash: 1 },
    {
      name: 'uniq_approved_normal_question_fingerprint',
      unique: true,
      partialFilterExpression: { status: 'approved', duplicatePolicy: 'PROHIBIT', duplicateHash: { $type: 'string' } },
    },
  );
  return { questionsUpdated: updated, duplicateApprovedQuestionsMovedToReview: demotedDuplicates, uniqueIndex: 'uniq_approved_normal_question_fingerprint' };
}
