import { extractDocxQuestions } from './backend/src/extraction/extractDocxQuestions.js';
import { normalizeQuestions } from './backend/src/extraction/normalizeQuestions.js';
import { classifyQuestionMetadataBatch } from './backend/src/ai/classifyQuestion.js';
import { loadClassificationCatalog } from './backend/src/extraction/metadataClassifier.js';
import { loadSyllabusCatalog } from './backend/src/ai/syllabusCatalog.js';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const projectRoot = process.cwd();
dotenv.config({ path: path.join(projectRoot, 'backend', '.env') });
const docxPath = path.join(projectRoot, 'Physics_cleaned_dataset.docx');
const imageDir = path.join(projectRoot, 'backend/uploads/images/pipeline_test');
try { fs.mkdirSync(imageDir, { recursive: true }); } catch(e) {}

async function main() {
  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  try {
    const uri = process.env.MONGODB_URI || 'mongodb+srv://admin-examforge:admin123@exam-forge.rv32zqk.mongodb.net/test';
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('MONGO: connected');
  } catch(err) { console.log('MONGO: failed - ' + err.message); }
  
  // Load catalog + syllabus
  console.log('Loading catalog...');
  let catalog = { subjects: [], examTypes: [] };
  try {
    catalog = await loadClassificationCatalog();
    const syllabus = await loadSyllabusCatalog().catch(() => null);
    if (syllabus) catalog.syllabus = syllabus;
    console.log('CATALOG: subjects=' + (catalog.subjects?.length || 0) + ' examTypes=' + (catalog.examTypes?.length || 0) + ' syllabus=' + (syllabus ? 'yes' : 'no'));
  } catch(err) { console.log('CATALOG: failed - ' + err.message); }
  
  // Extract
  console.log('');
  console.log('=== EXTRACTION ===');
  const extractStart = Date.now();
  const ext = await extractDocxQuestions(docxPath, { imageDir, returnRawBlocks: true });
  const extractDur = Date.now() - extractStart;
  console.log('Duration: ' + extractDur + 'ms');
  console.log('Blocks: ' + (ext.blocks?.length || 0));
  console.log('Images: ' + (ext.images?.length || 0));
  console.log('Warnings: ' + JSON.stringify(ext.warnings));
  
  // Reconstruct
  console.log('');
  console.log('=== RECONSTRUCTION ===');
  const reconStart = Date.now();
  const questions = await normalizeQuestions(ext.blocks, { returnRawBlocks: false });
  const reconDur = Date.now() - reconStart;
  console.log('Duration: ' + reconDur + 'ms');
  console.log('Questions: ' + questions.length);
  
  // Type breakdown
  let types = {};
  questions.forEach(q => { 
    const t = q.questionType || 'UNKNOWN';
    types[t] = (types[t] || 0) + 1; 
  });
  console.log('Types: ' + JSON.stringify(types));
  
  // Image and table stats
  let imgInQ = 0;
  let tableQs = [];
  questions.forEach((q, i) => {
    const imgs = q.questionImages || [];
    imgInQ += imgs.length;
    if (q.hasTable || (q.renderingMetadata?.tables?.length > 0)) {
      tableQs.push(i+1);
    }
  });
  console.log('Images in questions: ' + imgInQ);
  console.log('Questions with tables: [' + tableQs.join(',') + ']');
  
  // AI Classification
  console.log('');
  console.log('=== AI CLASSIFICATION ===');
  const aiStart = Date.now();
  
  let classified = null;
  try {
    classified = await classifyQuestionMetadataBatch(questions, catalog, {
      uploadId: 'debug-full-pipeline', batchIndex: 0
    }, { skipLlm: false, uploadId: 'debug-full-pipeline' });
    
    const aiDur = Date.now() - aiStart;
    console.log('Duration: ' + aiDur + 'ms');
    console.log('Results: ' + (classified?.length || 0));
    
    if (classified && classified.length > 0) {
      let withAI = 0, needsReview = 0, avgConf = 0;
      classified.forEach((c, i) => {
        const providers = c.aiMetadata?.providers || [];
        if (providers.includes('exforge_llama')) withAI++;
        if (c.status === 'needs_review') needsReview++;
        avgConf += (c.aiConfidence || 0);
      });
      avgConf = avgConf / classified.length;
      console.log('With AI (exforge_llama): ' + withAI);
      console.log('Needs review: ' + needsReview);
      console.log('Avg confidence: ' + avgConf.toFixed(1));
      
      // Show sample classifications
      console.log('');
      console.log('Sample classifications (first 5 + last 3):');
      classified.forEach((c, i) => {
        if (i < 5 || i >= classified.length - 3) {
          console.log('  Q' + (i+1) + ': class=' + c.class + ' diff=' + c.difficulty + ' conf=' + c.aiConfidence + ' status=' + c.status + ' prov=' + JSON.stringify(c.aiMetadata?.providers));
        }
      });
    }
  } catch(err) {
    console.log('Classification failed: ' + err.message);
    if (err.stack) console.log(err.stack.slice(0, 500));
  }
  
  await mongoose.disconnect().catch(() => {});
  
  console.log('');
  console.log('=== PIPELINE COMPLETE ===');
}

main().catch(e => { console.log('FATAL: ' + e.message); if (e.stack) console.log(e.stack.slice(0, 300)); });
