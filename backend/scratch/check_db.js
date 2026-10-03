import mongoose from 'mongoose';
import { Upload } from '../src/models/Upload.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/examforge_test', { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to MongoDB (test)');

  const latestUpload = await Upload.findOne().sort({ createdAt: -1 });
  if (!latestUpload) {
    console.log('No uploads found');
    await mongoose.disconnect();
    return;
  }

  console.log(`Latest Upload: ID=${latestUpload._id} status=${latestUpload.status} filename=${latestUpload.originalName}`);
  console.log('Total Staged Questions in DB:', latestUpload.stagedQuestions?.length);

  latestUpload.stagedQuestions.forEach((q, idx) => {
    console.log(`Q${idx+1}: [qnum=${q.renderingMetadata?.questionNumber}] questionType="${q.questionType}" section="${q.renderingMetadata?.section || q.section}" tags=${JSON.stringify(q.tags)}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
