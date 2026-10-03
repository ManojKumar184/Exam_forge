import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { performance } from 'perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.join(backendRoot, '.env') });

import { env } from '../src/config/env.js';
import { loadSyllabusCatalog } from '../src/ai/syllabusCatalog.js';
import { extractionService } from '../src/extraction/index.js';

// Import Xenova Transformers
import { pipeline } from '@xenova/transformers';

function dotProduct(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

async function main() {
  console.log('Connecting to database...');
  await mongoose.connect(env.mongodbUri);
  console.log('Connected to database.');

  // Load syllabus catalog
  console.log('Loading syllabus catalog...');
  const syllabus = await loadSyllabusCatalog();
  const chapters = syllabus.chapters || [];
  console.log(`Loaded ${chapters.length} chapters.`);

  if (chapters.length === 0) {
    console.error('No chapters found in syllabus catalog. Please seed database first.');
    await mongoose.disconnect();
    return;
  }

  // 1. Measure Model Load Time
  console.log('\n==================================================');
  console.log('1. INITIALIZING LOCAL MINI-LM-L6-V2 PIPELINE...');
  console.log('==================================================');
  const modelStart = performance.now();
  
  // Disable local model check to force download/cache on first run, or run locally
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  
  const modelTime = performance.now() - modelStart;
  console.log(`Model Loaded in ${modelTime.toFixed(2)}ms`);

  async function getEmbedding(text) {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  // 2. Measure Syllabus Precomputation Time
  console.log('\n==================================================');
  console.log(`2. PRECOMPUTING VECTORS FOR ${chapters.length} CHAPTERS...`);
  console.log('==================================================');
  const precompStart = performance.now();
  const startMemory = process.memoryUsage().heapUsed;

  const chapterVectors = [];
  // For benchmarking, we will embed all chapters
  for (const ch of chapters) {
    const vector = await getEmbedding(ch.name);
    chapterVectors.push({
      id: ch._id,
      name: ch.name,
      vector
    });
  }

  const precompTime = performance.now() - precompStart;
  const memoryIncrease = (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024;
  console.log(`Precomputed ${chapters.length} vectors in ${precompTime.toFixed(2)}ms (${(precompTime / chapters.length).toFixed(2)}ms/ch)`);
  console.log(`Memory footprint of precomputed vectors: ${memoryIncrease.toFixed(4)} MB`);

  // Load sample questions
  const samplePath = path.resolve(backendRoot, '../Physics_cleaned_dataset.docx');
  console.log(`\nExtracting test questions from: ${samplePath}`);
  const extractResult = await extractionService.processFile(samplePath, 'docx', {
    returnRawBlocks: true,
    skipLlm: true,
    skipRefinement: true
  });
  
  // Get first 10 questions to test classification speed
  const { normalizeQuestions } = await import('../src/extraction/normalizeQuestions.js');
  const normalized = await normalizeQuestions(extractResult.blocks.slice(0, 10), { skipLlm: true });
  console.log(`Extracted ${normalized.length} test questions.`);

  // 3. Classify test questions
  console.log('\n==================================================');
  console.log('3. RUNNING SEMANTIC VECTOR CLASSIFICATION...');
  console.log('==================================================');

  const classifyStart = performance.now();
  
  for (let i = 0; i < normalized.length; i++) {
    const q = normalized[i];
    const qText = q.questionText;
    const qStart = performance.now();
    
    // Embed question
    const qVector = await getEmbedding(qText);
    
    // Calculate similarities
    let bestMatch = null;
    let maxSim = -1;
    
    for (const chVec of chapterVectors) {
      const sim = dotProduct(qVector, chVec.vector);
      if (sim > maxSim) {
        maxSim = sim;
        bestMatch = chVec;
      }
    }
    
    const qDuration = performance.now() - qStart;
    console.log(`Question ${i + 1} (${qText.slice(0, 50)}...):`);
    console.log(`  -> Matched: "${bestMatch.name}" (similarity: ${maxSim.toFixed(4)})`);
    console.log(`  -> Duration: ${qDuration.toFixed(2)}ms`);
  }

  const totalClassTime = performance.now() - classifyStart;
  console.log(`--------------------------------------------------`);
  console.log(`Total classification time for ${normalized.length} questions: ${totalClassTime.toFixed(2)}ms (${(totalClassTime / normalized.length).toFixed(2)}ms/q)`);
  console.log(`Peak Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`==================================================`);

  await mongoose.disconnect();
  console.log('Disconnected from database.');
}

main().catch(err => {
  console.error('Benchmark crashed:', err);
  process.exit(1);
});
