import { extractDocxQuestions } from './extractDocxQuestions.js';
import fs from 'fs/promises';
import path from 'path';

async function runValidation() {
  try {
    const docxPath = 'c:/Users/manoj555/Desktop/Exam_forge/Physics_cleaned_dataset.docx';
    console.log('=== RUNNING METRICS FOR PHYSICS_CLEANED_DATASET.DOCX ===\n');

    // 1. Get raw blocks to understand "Before" state
    const rawResult = await extractDocxQuestions(docxPath, { returnRawBlocks: true });
    const rawBlocks = rawResult.blocks || [];
    const totalDetected = rawBlocks.length;

    // 2. Get normalized questions to understand "After" state
    const normalResult = await extractDocxQuestions(docxPath);
    const questions = normalResult.questions || [];
    const totalReconstructed = questions.length;

    // 3. Count explanations extracted
    const withExplanations = questions.filter(q => q.explanation && q.explanation.trim().length > 0);
    const explanationsCount = withExplanations.length;
    const explanationRate = (explanationsCount / totalReconstructed) * 100;

    // 4. Calculate Option Alignment Rate (expecting 4 options for MCQs)
    const mcqQuestions = questions.filter(q => q.questionType === 'mcq');
    const fullyAlignedMcqs = mcqQuestions.filter(q => q.options && q.options.length >= 4);
    const optionAlignmentRate = mcqQuestions.length > 0 ? (fullyAlignedMcqs.length / mcqQuestions.length) * 100 : 100;

    // 5. Calculate average reconstruction confidence
    const totalConfidence = questions.reduce((sum, q) => sum + (q.parserConfidence || q.aiConfidence || 0), 0);
    const avgConfidence = totalReconstructed > 0 ? (totalConfidence / totalReconstructed) : 0;

    // 6. Calculate stem similarity metrics (reconstructed stem length vs raw block lines length)
    let totalSimilarity = 0;
    questions.forEach((q, idx) => {
      const rawBlock = rawBlocks[idx];
      if (rawBlock) {
        const rawText = rawBlock.lines.join('\n');
        const reconstructedText = q.questionText;
        const shorter = Math.min(rawText.length, reconstructedText.length);
        const longer = Math.max(rawText.length, reconstructedText.length);
        const similarity = longer > 0 ? (shorter / longer) * 100 : 100;
        totalSimilarity += similarity;
      }
    });
    const avgSimilarity = totalReconstructed > 0 ? (totalSimilarity / totalReconstructed) : 100;

    // 7. Check for unsupported tags
    const unsupportedTags = [];
    rawBlocks.forEach((b) => {
      if (b.metadata) {
        Object.keys(b.metadata).forEach((k) => {
          if (!['type', 'class', 'difficulty', 'subject', 'chapter'].includes(k)) {
            unsupportedTags.push(k);
          }
        });
      }
    });

    // 8. Output Report
    console.log('========================================================');
    console.log('                  INGESTION METRICS REPORT              ');
    console.log('========================================================');
    console.log(`1. Questions Detected (Raw Blocks): ${totalDetected}`);
    console.log(`2. Questions Successfully Reconstructed: ${totalReconstructed}`);
    console.log(`3. Explanations Extracted: ${explanationsCount}`);
    console.log(`4. Explanation Extraction Rate: ${explanationRate.toFixed(2)}%`);
    console.log(`5. Option Alignment Rate (MCQ >= 4 options): ${optionAlignmentRate.toFixed(2)}% (out of ${mcqQuestions.length} MCQs)`);
    console.log(`6. Stem Similarity Metrics (Fidelity): ${avgSimilarity.toFixed(2)}%`);
    console.log(`7. Average Ingestion Confidence: ${(avgConfidence * 100).toFixed(2)}%`);
    console.log(`8. Parsing Failures: ${totalDetected - totalReconstructed}`);
    console.log(`9. Unsupported Tags Found: ${unsupportedTags.length > 0 ? [...new Set(unsupportedTags)].join(', ') : 'None'}`);
    console.log('========================================================\n');

    console.log('=== BEFORE VS AFTER INGESTION COMPARISON (SAMPLE) ===');
    const sampleIndices = [0, 1, 2];
    sampleIndices.forEach((idx) => {
      const raw = rawBlocks[idx];
      const after = questions[idx];
      if (raw && after) {
        console.log(`\n--- QUESTION SAMPLE ${idx + 1} ---`);
        console.log(`BEFORE (Raw block text):`);
        console.log(`  Lines: ${JSON.stringify(raw.lines.slice(0, 2))}`);
        console.log(`  Options Count: ${raw.options?.length || 0}`);
        console.log(`  Raw Tags: ${JSON.stringify(raw.tags || [])}`);
        console.log(`AFTER (Reconstructed Question):`);
        console.log(`  Stem: "${after.questionText.slice(0, 120)}..."`);
        console.log(`  Options Count: ${after.options?.length || 0}`);
        if (after.options?.length) {
          console.log(`  Options Preview: ${after.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o.text.slice(0, 40)}`).join(' | ')}`);
        }
        console.log(`  Explanation: "${after.explanation}"`);
      }
    });

  } catch (err) {
    console.error('Validation script failed:', err);
  }
}

runValidation();
