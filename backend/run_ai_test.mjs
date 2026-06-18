import { extractDocxQuestions } from './src/extraction/extractDocxQuestions.js';
import { normalizeQuestions } from './src/extraction/normalizeQuestions.js';
import { classifyQuestionMetadataBatch } from './src/ai/classifyQuestion.js';
import { loadClassificationCatalog } from './src/extraction/metadataClassifier.js';
import { loadSyllabusCatalog } from './src/ai/syllabusCatalog.js';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const projectRoot = process.cwd().replace('/backend', '').replace('\\backend', '');
dotenv.config({ path: path.join(projectRoot, 'backend', '.env') });
const docxPath = path.join(projectRoot, 'Physics_cleaned_dataset.docx');
const imageDir = path.join(projectRoot, 'backend/uploads/images/pipeline_test2');
try { fs.mkdirSync(imageDir, { recursive: true }); } catch(e) {}

async function main() {
  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  try {
    const uri = process.env.MONGODB_URI || 'mongodb+srv://admin-examforge:admin123@exam-forge.rv32zqk.mongodb.net/test';
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log('MONGO: connected');
  } catch(err) { 
    console.log('MONGO: failed - ' + err.message);
    console.log('Proceeding with empty catalog...');
  }
  
  // Load catalog + syllabus
  console.log('Loading catalog...');
  let catalog = { subjects: [], examTypes: [], syllabus: null };
  try {
    catalog = await loadClassificationCatalog();
    const syllabus = await loadSyllabusCatalog().catch(() => null);
    if (syllabus) catalog.syllabus = syllabus;
    console.log('CATALOG: subjects=' + (catalog.subjects?.length || 0) + ' examTypes=' + (catalog.examTypes?.length || 0) + ' syllabus=' + (catalog.syllabus ? 'yes' : 'no'));
    if (catalog.examTypes?.length > 0) {
      catalog.examTypes.slice(0, 5).forEach(et => console.log('  ExamType:', et.name, et._id));
    }
  } catch(err) { console.log('CATALOG: failed - ' + err.message); }
  
  // Extract
  console.log('');
  console.log('=== EXTRACTION ===');
  const ext = await extractDocxQuestions(docxPath, { imageDir, returnRawBlocks: true });
  console.log('Blocks: ' + (ext.blocks?.length || 0));
  console.log('Images array: ' + (ext.images?.length || 0));
  console.log('Warnings: ' + JSON.stringify(ext.warnings || []));
  
  // Reconstruct
  console.log('');
  console.log('=== RECONSTRUCTION ===');
  const questions = await normalizeQuestions(ext.blocks, { returnRawBlocks: false });
  console.log('Questions: ' + questions.length);
  
  // Type breakdown
  let types = {};
  let imgCount = 0;
  let tableCount = 0;
  let matchFollowIdx = -1;
  questions.forEach((q, i) => {
    const t = q.questionType || 'UNKNOWN';
    types[t] = (types[t] || 0) + 1;
    imgCount += (q.questionImages?.length || 0);
    if (q.hasTable || (q.renderingMetadata?.tables?.length > 0)) tableCount++;
    if (t === 'MATCH_FOLLOWING') matchFollowIdx = i + 1;
    
    // Debug first 2 and table/match questions
    if (i < 2 || t === 'MATCH_FOLLOWING' || q.questionImages?.length > 0) {
      console.log('Q' + (i+1) + ': type=' + t + ' opts=' + (q.options?.length || 0) + ' imgs=' + (q.questionImages?.length || 0) + ' table=' + (q.hasTable ? 1 : 0));
    }
  });
  console.log('Types: ' + JSON.stringify(types));
  console.log('Total images in questions: ' + imgCount);
  console.log('Questions with tables: ' + tableCount);
  console.log('Match-following at index: ' + matchFollowIdx);
  
  // AI Classification
  console.log('');
  console.log('=== AI CLASSIFICATION ===');
  console.log('Classifying ' + questions.length + ' questions via ExForge Llama...');
  const aiStart = Date.now();
  
  let classified = null;
  try {
    classified = await classifyQuestionMetadataBatch(questions, catalog, {
      uploadId: 'debug-ai-test', batchIndex: 0
    }, { skipLlm: false, uploadId: 'debug-ai-test' });
    
    const aiDur = Date.now() - aiStart;
    console.log('Duration: ' + aiDur + 'ms (' + (aiDur/1000).toFixed(1) + 's)');
    console.log('Results: ' + (classified?.length || 0));
    
    if (classified && classified.length > 0) {
      let withAI = 0;
      let needsReview = 0;
      let totalConf = 0;
      let providerCombos = {};
      
      classified.forEach((c, i) => {
        const providers = c.aiMetadata?.providers || [];
        const key = providers.join('+');
        providerCombos[key] = (providerCombos[key] || 0) + 1;
        if (providers.includes('exforge_llama')) withAI++;
        if (c.status === 'needs_review') {
          needsReview++;
          console.log('  REVIEW Q' + (i+1) + ': class=' + c.class + ' subject=' + (c.subjectId || 'none') + ' conf=' + c.aiConfidence + ' prov=' + key);
          if (c.extractionWarnings?.length) console.log('    warns: ' + JSON.stringify(c.extractionWarnings));
        }
        totalConf += (c.aiConfidence || 0);
      });
      
      console.log('With AI (exforge_llama): ' + withAI + '/' + classified.length);
      console.log('Needs review: ' + needsReview);
      console.log('Avg confidence: ' + (totalConf / classified.length).toFixed(1));
      console.log('Provider combos: ' + JSON.stringify(providerCombos));
      
      // Print question-by-question for first 5 and last 3
      console.log('');
      console.log('Classification details (sample):');
      classified.forEach((c, i) => {
        if (i < 5 || i >= classified.length - 3 || i === matchFollowIdx - 1) {
          const provs = c.aiMetadata?.providers || [];
          console.log('  Q' + (i+1) + ': class=' + c.class + ' subj=' + ((c.subjectId||'').toString().slice(0,15)) + ' diff=' + c.difficulty + ' conf=' + c.aiConfidence + ' status=' + c.status + ' prov=' + provs.join('+'));
        }
      });
    }
  } catch(err) {
    console.log('Classification FAILED: ' + err.message);
    console.log(err.stack ? err.stack.slice(0, 500) : '');
  }
  
  await mongoose.disconnect().catch(() => {});
  console.log('');
  console.log('=== AI TEST COMPLETE ===');
}

main().catch(e => { console.log('FATAL: ' + e.message); if (e.stack) console.log(e.stack.slice(0, 500)); });
