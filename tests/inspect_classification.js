import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Upload } from '../backend/src/models/Upload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/examforge_test';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Find the latest completed upload
  const upload = await Upload.findOne({ status: 'completed' }).sort({ createdAt: -1 });
  if (!upload) {
    console.log('No completed uploads found');
    process.exit(0);
  }

  console.log(`\n================ UPLOAD: ${upload._id} ================`);
  console.log('Original Name:', upload.originalName);
  console.log('Questions count:', upload.stagedQuestions.length);

  for (let i = 0; i < Math.min(5, upload.stagedQuestions.length); i++) {
    const q = upload.stagedQuestions[i];
    console.log(`\n--- Question ${i + 1} ---`);
    console.log('Stem preview:', (q.questionText || q.question_text || '').slice(0, 100));
    console.log('Class:', q.class);
    console.log('Subject ID:', q.subjectId);
    console.log('Chapter ID:', q.chapterId);
    console.log('Topic ID:', q.topicId);
    console.log('Exam Type ID:', q.examTypeId);
    console.log('Syllabus Mappings:', JSON.stringify(q.syllabusMappings, null, 2));
    console.log('Extraction Warnings:', q.extractionWarnings || q.extraction_warnings);
    console.log('AI Metadata:', JSON.stringify(q.aiMetadata || q.ai_metadata, null, 2));
  }

  await mongoose.disconnect();
  console.log('\nDisconnected');
}

run().catch(console.error);
