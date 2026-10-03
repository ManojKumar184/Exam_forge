import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { migrateQuestionMarks } from './migrateQuestionMarks.js';

try {
  await connectDatabase();
  const result = await migrateQuestionMarks();
  console.log(`[migration] question marks completed: ${result.modifiedCount} document(s) updated.`);
} catch (error) {
  console.error('[migration] question marks failed:', error.message);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
