import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { Question } from './models/Question.js';
import { QuestionBank } from './models/QuestionBank.js';

export async function migrateQuestionBanks() {
  console.log('[migration] Starting question bank migration...');

  // 1. Ensure System Global Bank exists
  let systemBank = await QuestionBank.findOne({ type: 'system', name: 'System Global Bank' });
  if (!systemBank) {
    systemBank = new QuestionBank({
      name: 'System Global Bank',
      description: 'Global repository of questions accessible by everyone.',
      type: 'system',
      createdBy: null,
      institution: null,
      visibility: 'public',
    });
    await systemBank.save();
    console.log('[migration] Created System Global Bank:', systemBank._id);
  } else {
    console.log('[migration] System Global Bank already exists:', systemBank._id);
  }

  // 2. Map all questions with empty bankIds to System Global Bank
  const result = await Question.updateMany(
    { $or: [{ bankIds: { $exists: false } }, { bankIds: { $size: 0 } }] },
    { $set: { bankIds: [systemBank._id] } }
  );

  console.log(`[migration] Done. Associated ${result.modifiedCount} questions with System Global Bank.`);
  return systemBank._id;
}

// Support running directly
if (process.argv[1] && process.argv[1].endsWith('migrateQuestionBanks.js')) {
  async function runDirectly() {
    await connectDatabase();
    await migrateQuestionBanks();
    await disconnectDatabase();
    process.exit(0);
  }
  runDirectly().catch((err) => {
    console.error('[migration] Question bank migration failed:', err);
    process.exit(1);
  });
}
