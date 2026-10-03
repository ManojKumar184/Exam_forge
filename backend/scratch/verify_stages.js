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

async function main() {
  console.log('Connecting to database...');
  await mongoose.connect(env.mongodbUri);
  console.log('Connected to database.');

  const samplePath = path.resolve(backendRoot, '../Physics_cleaned_dataset.docx');
  console.log(`Processing file: ${samplePath}`);

  // Load syllabus catalog
  const catalog = await loadClassificationCatalog();
  const syllabus = await loadSyllabusCatalog();
  catalog.syllabus = syllabus;

  const uploadContext = {
    imageDir: path.join(backendRoot, 'uploads', 'images'),
    filename: 'Physics_cleaned_dataset.docx',
    source: 'upload',
    sourceFile: 'Physics_cleaned_dataset.docx',
    skipLlm: true,
    skipRefinement: true,
    returnRawBlocks: true,
  };

  // Run extraction
  console.log('Running Stage 0 Ingestion...');
  const extractResult = await extractionService.processFile(samplePath, 'docx', uploadContext);
  const rawBlocks = extractResult.blocks || [];
  console.log(`Extracted raw blocks: ${rawBlocks.length}`);

  // Run reconstruction
  console.log('Running 13-stage reconstruction pipeline...');
  const questions = await normalizeQuestions(rawBlocks, {
    ...uploadContext,
    returnRawBlocks: false,
  });
  console.log(`Reconstructed questions: ${questions.length}`);

  // Write stage-by-stage details to report1.txt
  const reportPath = path.resolve(backendRoot, '../report1.txt');
  console.log(`Writing report to: ${reportPath}`);

  let report = '';
  report += `================================================================================\n`;
  report += `               EXAMFORGE INGESTION PIPELINE 13-STAGE VERIFICATION REPORT        \n`;
  report += `================================================================================\n`;
  report += `Date: ${new Date().toISOString()}\n`;
  report += `Source Document: Physics_cleaned_dataset.docx\n`;
  report += `Total Questions Extracted: ${questions.length}\n`;
  report += `================================================================================\n\n`;

  let validCount = 0;
  let reviewCount = 0;

  questions.forEach((q, index) => {
    const debug = q.debugInfo || {};
    const stages = debug.stages || {};
    const isNeedsReview = q.status === 'needs_review';

    if (isNeedsReview) {
      reviewCount++;
    } else {
      validCount++;
    }

    report += `--------------------------------------------------------------------------------\n`;
    report += `QUESTION #${index + 1} (Serial ID: ${q.serialId || 'N/A'}) - Status: ${q.status.toUpperCase()}\n`;
    report += `--------------------------------------------------------------------------------\n`;
    report += `Final Stem Preview: "${q.questionText.slice(0, 150)}..."\n`;
    report += `Final Options Count: ${q.options ? q.options.length : 0}\n`;
    report += `Correct Option Index: ${q.correctOption !== null ? q.correctOption : 'N/A'}\n`;
    report += `SaaS Correct Answers: [${(q.correctAnswers || []).join(', ')}]\n`;
    report += `Explanation: ${q.explanation ? `"${q.explanation.slice(0, 150)}..."` : 'NONE'}\n`;
    report += `Warnings: [${(q.extractionWarnings || []).join('; ')}]\n\n`;

    // Audit each stage
    for (let sIdx = 0; sIdx <= 13; sIdx++) {
      const stageKey = `stage${sIdx}`;
      const stage = stages[stageKey];
      if (!stage) {
        report += `  Stage ${sIdx}: MISSING IN DEBUG STAGES\n`;
        continue;
      }

      report += `  [STAGE ${sIdx}] ${stage.title || 'Untitled'}\n`;

      if (sIdx === 0) {
        report += `    - MIME Types: ${(stage.mime_types || []).join(', ')}\n`;
        report += `    - Payload Sizes: ${JSON.stringify(stage.payload_sizes)}\n`;
        if (stage.payloadFingerprint) {
          report += `    - Source Detection: ${stage.payloadFingerprint.sourceType} (OMML: ${stage.payloadFingerprint.containsOMML}, Images: ${stage.payloadFingerprint.containsImages})\n`;
        }
      } else if (sIdx === 1) {
        report += `    - Word clean markup size: ${stage.after_html ? stage.after_html.length : 0} chars\n`;
        report += `    - Removed Tags: ${(stage.removed_tags || []).join(', ') || 'None'}\n`;
        report += `    - Math nodes detected: ${(stage.math_containing_nodes || []).join(', ') || 'None'}\n`;
      } else if (sIdx === 2) {
        report += `    - Normalization log actions: ${(stage.normalization_log || []).map(l => l.action).join(', ') || 'None'}\n`;
      } else if (sIdx === 3) {
        report += `    - Isolated figures count: ${stage.figures_extracted ? stage.figures_extracted.length : 0}\n`;
      } else if (sIdx === 4) {
        report += `    - Math equations shielded: ${stage.preserved_math_count || 0}\n`;
      } else if (sIdx === 5) {
        report += `    - Extracted DOM blocks: ${stage.blocks ? stage.blocks.length : 0}\n`;
      } else if (sIdx === 6) {
        report += `    - Option detection confidence: ${stage.option_confidence || 'N/A'}\n`;
        report += `    - Detected options count: ${stage.detected_options ? stage.detected_options.length : 0}\n`;
      } else if (sIdx === 7) {
        report += `    - Extracted statement groups: ${stage.statement_groups ? stage.statement_groups.length : 0}\n`;
      } else if (sIdx === 8) {
        report += `    - Tables isolated count: ${stage.tables ? stage.tables.length : 0}\n`;
      } else if (sIdx === 9) {
        report += `    - Ollama refinement status: Refined=${stage.refined}, Warnings: ${(stage.warnings || []).join('; ') || 'None'}\n`;
      } else if (sIdx === 10) {
        report += `    - Classified Question Type: ${stage.classified_type}\n`;
        report += `    - Evidence: ${(stage.evidence || []).join('; ')}\n`;
      } else if (sIdx === 11) {
        report += `    - Class: ${stage.class}, Difficulty: ${stage.difficulty}, Status: ${stage.status}\n`;
      } else if (sIdx === 12) {
        report += `    - Malformed math expressions: ${(stage.malformed_expressions || []).length}\n`;
        if (stage.malformed_expressions && stage.malformed_expressions.length > 0) {
          report += `      -> Details: ${stage.malformed_expressions.join('; ')}\n`;
        }
      } else if (sIdx === 13) {
        report += `    - Database object successfully generated: ${stage.db_object ? 'YES' : 'NO'}\n`;
      }
      report += `\n`;
    }
    report += `\n`;
  });

  report += `================================================================================\n`;
  report += `                               PIPELINE SUMMARY                                 \n`;
  report += `================================================================================\n`;
  report += `Total Questions Processed: ${questions.length}\n`;
  report += `Valid (No Review Needed): ${validCount} (${((validCount / questions.length) * 100).toFixed(1)}%)\n`;
  report += `Needs Review (Warnings/Errors): ${reviewCount} (${((reviewCount / questions.length) * 100).toFixed(1)}%)\n`;
  report += `================================================================================\n`;

  await fs.writeFile(reportPath, report);
  console.log(`Verification completed successfully. Report written to report1.txt.`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
