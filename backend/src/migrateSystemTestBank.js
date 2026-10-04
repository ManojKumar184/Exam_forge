import { QuestionBank } from './models/QuestionBank.js';

export async function migrateSystemTestBank() {
  const existingCount = await QuestionBank.countDocuments({ type: 'system_test' });
  if (existingCount > 1) {
    throw new Error('Multiple System Test Banks exist; reconcile them before enabling the canonical bank migration.');
  }
  const bank = await QuestionBank.findOneAndUpdate(
    { type: 'system_test' },
    { $set: { systemKey: 'SYSTEM_TEST' }, $setOnInsert: {
      name: 'System Test Bank',
      description: 'Controlled test content for validating paper generation and assessments.',
      type: 'system_test',
      createdBy: null,
      institution: null,
      institutionId: null,
      visibility: 'private',
      visibleToFaculty: false,
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await QuestionBank.collection.createIndex({ systemKey: 1 }, { unique: true, sparse: true });
  return { systemTestBankId: bank._id.toString(), visibleToFaculty: bank.visibleToFaculty };
}
