import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { performance } from 'perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.join(backendRoot, '.env') });

import { env } from '../src/config/env.js';
import { extractionService } from '../src/extraction/index.js';
import { loadSyllabusCatalog } from '../src/ai/syllabusCatalog.js';
import { loadClassificationCatalog } from '../src/extraction/metadataClassifier.js';
import { normalizeQuestions } from '../src/extraction/normalizeQuestions.js';
import { classifyQuestionMetadataBatch } from '../src/ai/classifyQuestion.js';

// Setup event loop lag monitoring
let maxLag = 0;
let lagInterval;

function startLagMonitor() {
  let lastTime = performance.now();
  maxLag = 0;
  lagInterval = setInterval(() => {
    const now = performance.now();
    const lag = now - lastTime - 50; // 50ms is the interval
    if (lag > maxLag) {
      maxLag = lag;
    }
    lastTime = now;
  }, 50);
}

function stopLagMonitor() {
  clearInterval(lagInterval);
  return maxLag;
}

async function runBenchmarkForSize(size, baseBlocks, catalog, docMeta, uploadContext) {
  console.log(`\n==================================================`);
  console.log(`RUNNING BENCHMARK FOR SIZE: ${size} questions`);
  console.log(`==================================================`);

  // Replicate blocks to match target size
  const blocks = [];
  while (blocks.length < size) {
    for (const b of baseBlocks) {
      if (blocks.length >= size) break;
      // Deep clone block
      blocks.push(JSON.parse(JSON.stringify(b)));
    }
  }

  // Set individual question numbers
  blocks.forEach((b, idx) => {
    b.questionNumber = idx + 1;
    b.segmentId = `qseg-${idx + 1}`;
  });

  const startMemory = process.memoryUsage().heapUsed;
  const startTime = performance.now();
  startLagMonitor();

  // 1. Reconstruction Phase
  console.log(`Starting reconstruction of ${size} questions...`);
  const reconStart = performance.now();
  const reconstructedQuestions = await normalizeQuestions(blocks, {
    ...uploadContext,
    returnRawBlocks: false,
  });
  const reconTime = performance.now() - reconStart;
  console.log(`Reconstruction completed in ${reconTime.toFixed(2)}ms`);

  // 2. Classification Phase
  console.log(`Starting classification batch...`);
  const classStart = performance.now();
  let classifiedList = [];
  try {
    classifiedList = await classifyQuestionMetadataBatch(
      reconstructedQuestions,
      catalog,
      docMeta,
      uploadContext
    );
  } catch (err) {
    console.error(`Classification failed:`, err.message);
  }
  const classTime = performance.now() - classStart;
  console.log(`Classification completed in ${classTime.toFixed(2)}ms`);

  const totalTime = performance.now() - startTime;
  const loopLag = stopLagMonitor();
  const endMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = (endMemory - startMemory) / 1024 / 1024;

  console.log(`--------------------------------------------------`);
  console.log(`Size: ${size} questions`);
  console.log(`Reconstruction Time: ${reconTime.toFixed(2)}ms (${(reconTime / size).toFixed(2)}ms/q)`);
  console.log(`Classification Time: ${classTime.toFixed(2)}ms (${(classTime / size).toFixed(2)}ms/q)`);
  console.log(`Total Time: ${totalTime.toFixed(2)}ms (${(totalTime / size).toFixed(2)}ms/q)`);
  console.log(`Max Event Loop Lag: ${loopLag.toFixed(2)}ms`);
  console.log(`Heap Growth: ${memoryIncrease.toFixed(2)} MB`);
  console.log(`Peak Memory Heap: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`==================================================`);

  return {
    size,
    reconTime,
    classTime,
    totalTime,
    loopLag,
    memoryIncrease
  };
}

async function main() {
  console.log('Connecting to database...');
  await mongoose.connect(env.mongodbUri);
  console.log('Connected to database.');

  const samplePath = path.resolve(backendRoot, '../Physics_cleaned_dataset.docx');
  console.log(`Loading sample file: ${samplePath}`);
  
  // 1. Measure Catalog load & cache performance
  const catStart = performance.now();
  const catalog1 = await loadClassificationCatalog();
  const syllabus1 = await loadSyllabusCatalog();
  catalog1.syllabus = syllabus1;
  const dbCatalogTime = performance.now() - catStart;
  console.log(`First Catalog Load (DB Query): ${dbCatalogTime.toFixed(2)}ms`);

  const cacheStart = performance.now();
  const catalog2 = await loadClassificationCatalog();
  const syllabus2 = await loadSyllabusCatalog();
  catalog2.syllabus = syllabus2;
  const cacheCatalogTime = performance.now() - cacheStart;
  console.log(`Second Catalog Load (In-Memory Cache): ${cacheCatalogTime.toFixed(2)}ms`);

  // Extract base blocks from file
  console.log('Extracting base blocks from document...');
  const uploadContext = {
    imageDir: path.join(backendRoot, 'uploads', 'images'),
    filename: 'Physics_cleaned_dataset.docx',
    source: 'upload',
    sourceFile: 'Physics_cleaned_dataset.docx',
    skipLlm: true, // Benchmarking deterministic parser performance
    skipRefinement: true,
    returnRawBlocks: true,
  };

  const extractResult = await extractionService.processFile(samplePath, 'docx', uploadContext);
  const baseBlocks = extractResult.blocks || [];
  console.log(`Base blocks extracted: ${baseBlocks.length}`);

  const docMeta = {
    defaultClass: 11,
    classesFound: [11],
    isMixed: false,
    subjectId: null,
    examTypeId: null,
    warnings: [],
  };

  const results = [];
  
  // Run benchmarks on 100, 500, and 1000 questions
  for (const size of [100, 500, 1000]) {
    // Run garbage collection if available
    if (global.gc) {
      global.gc();
    }
    const res = await runBenchmarkForSize(size, baseBlocks, catalog1, docMeta, uploadContext);
    results.push(res);
  }

  console.log('\n==================================================');
  console.log('SUMMARY TABLE:');
  console.log('==================================================');
  console.log(`Size\tTotal Time\tRecon Time\tClass Time\tLag\tHeap Growth`);
  results.forEach(r => {
    console.log(`${r.size}\t${r.totalTime.toFixed(0)}ms\t${r.reconTime.toFixed(0)}ms\t${r.classTime.toFixed(0)}ms\t${r.loopLag.toFixed(0)}ms\t${r.memoryIncrease.toFixed(1)}MB`);
  });
  console.log('==================================================');

  await mongoose.disconnect();
  console.log('Disconnected from database. Benchmark finished.');
}

main().catch(err => {
  console.error('Benchmark script crashed:', err);
  process.exit(1);
});
