import mongoose from 'mongoose';
import { env } from '../backend/src/config/env.js';
import { Upload } from '../backend/src/models/Upload.js';
import { SyllabusNode } from '../backend/src/models/SyllabusNode.js';

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(env.mongodbUri);
  console.log("Connected successfully.");

  // Find the last completed upload
  const upload = await Upload.findOne({ status: 'completed' }).sort({ updatedAt: -1 }).lean();
  if (!upload) {
    console.log("No completed uploads found.");
    await mongoose.disconnect();
    return;
  }

  console.log(`\nFound completed upload: ID=${upload._id}`);
  console.log(`Original Name: "${upload.originalName}"`);
  console.log(`Questions count: ${upload.stagedQuestions?.length || 0}`);

  const staged = upload.stagedQuestions || [];
  if (staged.length === 0) {
    console.log("No staged questions found in this upload.");
    await mongoose.disconnect();
    return;
  }

  // Retrieve all active SyllabusNodes for quick name lookup
  const nodes = await SyllabusNode.find({ isActive: true }).lean();
  const nodeMap = new Map(nodes.map(n => [n._id.toString(), n]));

  console.log("\n--- RAW FIRST STAGED QUESTION ---");
  console.log(JSON.stringify(staged[0], null, 2));

  console.log("\n--- STAGED QUESTIONS SAMPLE (First 5) ---");
  staged.slice(0, 5).forEach((q, idx) => {
    const textPreview = (q.stem || q.questionText || '').slice(0, 80).replace(/\n/g, ' ');
    const mapping = (q.syllabusMappings && q.syllabusMappings[0]) || {};
    
    const subjectNode = nodeMap.get(String(mapping.subjectId));
    const chapterNode = nodeMap.get(String(mapping.chapterId));
    const topicNode = nodeMap.get(String(mapping.topicId));

    console.log(`Q${idx+1}: [${q.questionType}] class=${q.class} diff=${q.difficulty} status=${q.status} confidence=${q.aiConfidence}`);
    console.log(`     Text: "${textPreview}"`);
    console.log(`     Mappings:`);
    console.log(`       - Subject: ID=${mapping.subjectId || 'null'} Name="${subjectNode ? subjectNode.name : 'null'}"`);
    console.log(`       - Chapter: ID=${mapping.chapterId || 'null'} Name="${chapterNode ? chapterNode.name : 'null'}"`);
    console.log(`       - Topic:   ID=${mapping.topicId || 'null'} Name="${topicNode ? topicNode.name : 'null'}"`);
    console.log('');
  });

  // Let's count resolved mappings vs null mappings
  let fullyMapped = 0;
  let subjectMapped = 0;
  let chapterMapped = 0;
  let topicMapped = 0;
  staged.forEach(q => {
    const m = (q.syllabusMappings && q.syllabusMappings[0]) || {};
    if (m.subjectId) subjectMapped++;
    if (m.chapterId) chapterMapped++;
    if (m.topicId) topicMapped++;
    if (m.subjectId && m.chapterId) fullyMapped++;
  });

  console.log("--- MAPPING STATISTICS ---");
  console.log(`Total Staged: ${staged.length}`);
  console.log(`Subject Mapped: ${subjectMapped}`);
  console.log(`Chapter Mapped: ${chapterMapped}`);
  console.log(`Topic Mapped: ${topicMapped}`);
  console.log(`Fully Mapped (Subject + Chapter): ${fullyMapped}`);

  await mongoose.disconnect();
  console.log("\nDisconnected.");
}

main().catch(console.error);
