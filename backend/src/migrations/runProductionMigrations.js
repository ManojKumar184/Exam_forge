import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Institution } from '../models/Institution.js';
import { SyllabusNode } from '../models/SyllabusNode.js';
import { seedPredefinedTemplates } from '../config/predefinedTemplates.js';
import { migrateInstitutions } from '../migrateInstitutions.js';
import { migrateQuestionBanks } from '../migrateQuestionBanks.js';
import { migrateSyllabus } from '../migrateSyllabus.js';
import { seedSyllabus } from '../seedSyllabus.js';
import { migrateQuestionMarks } from './migrateQuestionMarks.js';
import { initializeQuestionSequenceIds, migrateWorkspaceQuestions } from './workspaceMigrations.js';
import { REQUIRED_PRODUCTION_MIGRATIONS } from './productionMigrationPlan.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const steps = [
  ['institutions-v1', migrateInstitutions],
  ['predefined-templates-v1', seedPredefinedTemplates],
  ['question-banks-v1', migrateQuestionBanks],
  ['syllabus-seed-v1', async () => {
    if (await SyllabusNode.estimatedDocumentCount() === 0) await seedSyllabus();
    return { seeded: true };
  }],
  ['syllabus-mappings-v1', migrateSyllabus],
  ['question-sequence-v1', initializeQuestionSequenceIds],
  ['workspace-question-ownership-v1', migrateWorkspaceQuestions],
  ['question-marks-v1', migrateQuestionMarks],
];

export async function runProductionMigrations() {
  await connectDatabase();
  const collection = Institution.db.collection('app_migrations');
  try {
    for (const [id, run] of steps) {
      const previous = await collection.findOne({ _id: id, status: 'completed' });
      if (previous) {
        console.log(`[migration] ${id}: already completed at ${previous.completedAt?.toISOString?.() || 'recorded'}`);
        continue;
      }
      console.log(`[migration] ${id}: started`);
      try {
        const result = await run();
        await collection.updateOne(
          { _id: id },
          { $set: { status: 'completed', completedAt: new Date(), result: result || null }, $unset: { failureCategory: '' } },
          { upsert: true },
        );
        console.log(`[migration] ${id}: completed`);
      } catch (error) {
        await collection.updateOne(
          { _id: id },
          { $set: { status: 'failed', failedAt: new Date(), failureCategory: error?.name || 'Error' } },
          { upsert: true },
        );
        throw error;
      }
    }
    const completed = await collection.find({ _id: { $in: REQUIRED_PRODUCTION_MIGRATIONS }, status: 'completed' }).toArray();
    if (completed.length !== REQUIRED_PRODUCTION_MIGRATIONS.length) throw new Error('Production migration plan did not complete');
    return { completed: completed.map((row) => row._id) };
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runProductionMigrations()
    .then((result) => console.log(`[migration] production setup complete (${result.completed.length} steps)`))
    .catch((error) => {
      console.error(`[migration] production setup failed: ${error.message}`);
      process.exitCode = 1;
    });
}
