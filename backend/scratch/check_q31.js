import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });
import { env } from '../src/config/env.js';
import { Upload } from '../src/models/Upload.js';

async function main() {
  console.log('Connecting to database...');
  await mongoose.connect(env.mongodbUri);
  console.log('Connected to database.');

  try {
    const uploads = await Upload.find().lean();
    console.log(`Found ${uploads.length} uploads in database.`);

    for (const u of uploads) {
      console.log(`Upload ID: ${u._id}, file: ${u.originalName}`);
      const staged = u.stagedQuestions || [];
      console.log(`- Staged questions count: ${staged.length}`);

      for (let idx = 0; idx < staged.length; idx++) {
        const q = staged[idx];
        const tables = q.renderingMetadata?.tables || [];
        if (tables.length > 0 || q.hasTable) {
          console.log(`- Question #${idx + 1} has tables! type: ${q.questionType}`);
          console.log(`  Question Text: "${q.questionText.slice(0, 150)}..."`);
          console.log(`  Images:`, q.questionImages || q.images || []);
          console.log(`  Tables:`, JSON.stringify(tables, null, 2));
        }
      }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(console.error);
