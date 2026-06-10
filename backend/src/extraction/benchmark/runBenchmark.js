import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractDocxQuestions } from '../extractDocxQuestions.js';
import { runStagesReconstruction } from '../reconstructionPipeline.js';
import { documentIntelligencePipeline } from '../documentIntelligence/ingestionPipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATASET_PATH = path.join(__dirname, 'benchmarkDataset.json');
const PHYSICS_DOCX_PATH = path.join(__dirname, '../../../../Physics.docx');
const PHYSICS_CLEANED_PATH = path.join(__dirname, '../../../../Physics_cleaned_dataset.docx');
const RESULTS_PATH = path.join(__dirname, 'benchmark_results.json');

async function main() {
  const isAfter = process.argv.includes('--after');
  console.log(`==================================================`);
  console.log(`    EXAMFORGE INGESTION BENCHMARK HARNESS`);
  console.log(`    Mode: ${isAfter ? 'AFTER REFACTOR' : 'BEFORE REFACTOR'}`);
  console.log(`==================================================\n`);

  // 1. Run Synthetic Fixtures
  console.log(`[1/3] Running Synthetic Fixtures...`);
  const datasetRaw = await fs.readFile(DATASET_PATH, 'utf8');
  const dataset = JSON.parse(datasetRaw);
  const syntheticMetrics = [];

  for (const fixture of dataset.fixtures) {
    try {
      const res = await runStagesReconstruction(fixture.inputText, null, null, null, null, { skipLlm: true });
      const semanticRes = await documentIntelligencePipeline.process(
        { plain: fixture.inputText, clipboard: true, filename: `${fixture.id}.txt` },
        { skipLlm: true, sourceFile: `${fixture.id}.txt` }
      );
      const semanticQuestion = semanticRes.questions?.[0] || {};
      const questionType = res.questionType;
      const options = res.options || [];
      const hasTable = res.tables && res.tables.length > 0;
      const hasDiagram = res.figures && res.figures.length > 0;
      const hasEquation = res.formulas && res.formulas.length > 0;

      const typeMatch = questionType === fixture.expected.questionType || 
                        (fixture.expected.questionType === 'mcq' && ['mcq', 'mcq_single', 'mcq_multi'].includes(questionType));
      const optionMatch = options.length === fixture.expected.optionCount;
      const tableMatch = !fixture.expected.hasTable || hasTable;
      const diagramMatch = !fixture.expected.hasDiagram || hasDiagram || semanticQuestion.hasDiagram;
      const equationMatch = !fixture.expected.hasEquation || hasEquation;
      const answerMatch = !fixture.expected.answer ||
        fixture.expected.answer === 'present' ||
        normalizeAnswer(semanticQuestion.answerKey) === normalizeAnswer(fixture.expected.answer);
      const explanationMatch = !fixture.expected.hasExplanation || Boolean(semanticQuestion.explanation);
      const confidenceScores = semanticQuestion.renderingMetadata?.confidence || {};
      const reviewRequired = semanticQuestion.status === 'needs_review';

      syntheticMetrics.push({
        id: fixture.id,
        category: fixture.category,
        success: typeMatch && optionMatch && tableMatch && diagramMatch && equationMatch && answerMatch && explanationMatch,
        typeMatch,
        optionMatch,
        tableMatch,
        diagramMatch,
        equationMatch,
        answerMatch,
        explanationMatch,
        reviewRequired,
        confidenceScores,
        detectedType: questionType,
        semanticType: semanticQuestion.questionType,
        detectedOptions: options.length,
        semanticAnswer: semanticQuestion.answerKey || null
      });
    } catch (err) {
      syntheticMetrics.push({
        id: fixture.id,
        category: fixture.category,
        success: false,
        error: err.message
      });
    }
  }

  // 2. Run Real Document Ingestion
  console.log(`[2/3] Processing Real Documents (this might take a few seconds)...`);
  
  let physicsResults = { questions: [], warnings: [] };
  let cleanedResults = { questions: [], warnings: [] };
  
  try {
    physicsResults = await extractDocxQuestions(PHYSICS_DOCX_PATH, { skipLlm: true });
  } catch (err) {
    console.error(`Error processing Physics.docx:`, err.message);
  }

  try {
    cleanedResults = await extractDocxQuestions(PHYSICS_CLEANED_PATH, { skipLlm: true });
  } catch (err) {
    console.error(`Error processing Physics_cleaned_dataset.docx:`, err.message);
  }

  const parseDocxMetrics = (questions) => {
    let mcqCount = 0;
    let msqCount = 0;
    let numericalCount = 0;
    let descriptiveCount = 0;
    let otherCount = 0;
    let totalOptions = 0;
    let questionsWithTables = 0;
    let questionsWithEquations = 0;
    let questionsWithImages = 0;
    let lowConfidenceCount = 0;
    let questionsWithAnswers = 0;
    let questionsWithExplanations = 0;
    let reviewRequiredCount = 0;

    for (const q of questions) {
      const type = (q.questionType || '').toLowerCase();
      if (type.includes('mcq') || type === 'mcq_single' || type === 'mcq') mcqCount++;
      else if (type.includes('multi')) msqCount++;
      else if (type === 'numerical' || type === 'integer') numericalCount++;
      else if (type === 'descriptive') descriptiveCount++;
      else otherCount++;

      totalOptions += q.options?.length || 0;
      if (q.hasTable || q.renderingMetadata?.tables?.length > 0) questionsWithTables++;
      if (q.hasEquation || q.questionLatex) questionsWithEquations++;
      if (q.hasDiagram || q.questionImages?.length > 0) questionsWithImages++;
      if (q.parserConfidence < 0.7) lowConfidenceCount++;
      if (q.answerKey || q.answerText || q.correctAnswers?.length) questionsWithAnswers++;
      if (q.explanation) questionsWithExplanations++;
      if (q.status === 'needs_review') reviewRequiredCount++;
    }

    return {
      count: questions.length,
      mcqCount,
      msqCount,
      numericalCount,
      descriptiveCount,
      otherCount,
      totalOptions,
      questionsWithTables,
      questionsWithEquations,
      questionsWithImages,
      questionsWithAnswers,
      questionsWithExplanations,
      lowConfidenceCount,
      reviewRequiredCount
    };
  };

  const physicsStats = parseDocxMetrics(physicsResults.questions);
  const cleanedStats = parseDocxMetrics(cleanedResults.questions);

  const currentRun = {
    timestamp: new Date().toISOString(),
    synthetic: syntheticMetrics,
    physics: physicsStats,
    physicsCleaned: cleanedStats
  };

  // 3. Save & Compare Results
  let previousRun = null;
  try {
    const raw = await fs.readFile(RESULTS_PATH, 'utf8');
    previousRun = JSON.parse(raw);
  } catch (err) {
    // No previous run, that's fine
  }

  if (isAfter) {
    // If running in --after mode, we save as current after results and keep the before results if we had them
    const dataToSave = previousRun ? { before: previousRun.before || previousRun, after: currentRun } : { after: currentRun };
    await fs.writeFile(RESULTS_PATH, JSON.stringify(dataToSave, null, 2));
  } else {
    // In baseline mode, we save as before results
    const dataToSave = previousRun ? { ...previousRun, before: currentRun } : { before: currentRun };
    await fs.writeFile(RESULTS_PATH, JSON.stringify(dataToSave, null, 2));
  }

  console.log(`\n==================================================`);
  console.log(`                 RESULTS SUMMARY                  `);
  console.log(`==================================================`);
  console.log(`Synthetic Fixtures Accuracy:`);
  const synSuccess = syntheticMetrics.filter(m => m.success).length;
  console.log(`- Passed: ${synSuccess}/${syntheticMetrics.length} (${((synSuccess / syntheticMetrics.length) * 100).toFixed(1)}%)`);

  console.log(`\nPhysics.docx Stats:`);
  console.log(`- Extracted Questions: ${physicsStats.count}`);
  console.log(`- Options Extracted:   ${physicsStats.totalOptions}`);
  console.log(`- Tables Extracted:    ${physicsStats.questionsWithTables}`);
  console.log(`- Equations Extracted: ${physicsStats.questionsWithEquations}`);
  console.log(`- Images Extracted:    ${physicsStats.questionsWithImages}`);
  console.log(`- Answers Extracted:   ${physicsStats.questionsWithAnswers}`);
  console.log(`- Review Required:     ${physicsStats.reviewRequiredCount}`);

  console.log(`\nPhysics_cleaned_dataset.docx Stats:`);
  console.log(`- Extracted Questions: ${cleanedStats.count}`);
  console.log(`- Options Extracted:   ${cleanedStats.totalOptions}`);
  console.log(`- Tables Extracted:    ${cleanedStats.questionsWithTables}`);
  console.log(`- Equations Extracted: ${cleanedStats.questionsWithEquations}`);
  console.log(`- Images Extracted:    ${cleanedStats.questionsWithImages}`);
  console.log(`- Answers Extracted:   ${cleanedStats.questionsWithAnswers}`);
  console.log(`==================================================\n`);
  await writeQualityReport({ currentRun, syntheticMetrics, physicsStats, cleanedStats });

  // Write markdown report
  const before = previousRun?.before || previousRun;
  const after = isAfter ? currentRun : previousRun?.after;

  if (before || after) {
    let md = `# Ingestion Architecture Refactor Benchmark Report\n\n`;
    md += `Generated on: ${new Date().toLocaleString()}\n\n`;

    md += `## 1. Synthetic Fixtures Accuracy\n\n`;
    md += `| Category | Before Refactor Success | After Refactor Success | Detected Type (After) | Detected Options (After) |\n`;
    md += `| --- | --- | --- | --- | --- |\n`;

    const getSynSuccessSymbol = (metrics, id) => {
      const found = metrics?.find(m => m.id === id);
      return found ? (found.success ? '✅ PASS' : '❌ FAIL') : 'N/A';
    };

    const getSynDetail = (metrics, id) => {
      const found = metrics?.find(m => m.id === id);
      return found ? { type: found.detectedType || 'N/A', options: found.detectedOptions ?? 'N/A' } : { type: 'N/A', options: 'N/A' };
    };

    for (const fixture of dataset.fixtures) {
      const beforeSym = getSynSuccessSymbol(before?.synthetic, fixture.id);
      const afterSym = getSynSuccessSymbol(after?.synthetic, fixture.id);
      const detail = getSynDetail(after?.synthetic || before?.synthetic, fixture.id);
      md += `| ${fixture.category} | ${beforeSym} | ${afterSym} | ${detail.type} | ${detail.options} |\n`;
    }

    md += `\n## 2. Real Document Regression Comparison\n\n`;
    md += `| Metric | Physics.docx (Before) | Physics.docx (After) | Physics Cleaned (Before) | Physics Cleaned (After) |\n`;
    md += `| --- | --- | --- | --- | --- |\n`;
    md += `| **Extracted Questions** | ${before?.physics?.count ?? 'N/A'} | ${after?.physics?.count ?? 'N/A'} | ${before?.physicsCleaned?.count ?? 'N/A'} | ${after?.physicsCleaned?.count ?? 'N/A'} |\n`;
    md += `| **Total Options** | ${before?.physics?.totalOptions ?? 'N/A'} | ${after?.physics?.totalOptions ?? 'N/A'} | ${before?.physicsCleaned?.totalOptions ?? 'N/A'} | ${after?.physicsCleaned?.totalOptions ?? 'N/A'} |\n`;
    md += `| **Questions w/ Tables** | ${before?.physics?.questionsWithTables ?? 'N/A'} | ${after?.physics?.questionsWithTables ?? 'N/A'} | ${before?.physicsCleaned?.questionsWithTables ?? 'N/A'} | ${after?.physicsCleaned?.questionsWithTables ?? 'N/A'} |\n`;
    md += `| **Questions w/ Equations** | ${before?.physics?.questionsWithEquations ?? 'N/A'} | ${after?.physics?.questionsWithEquations ?? 'N/A'} | ${before?.physicsCleaned?.questionsWithEquations ?? 'N/A'} | ${after?.physicsCleaned?.questionsWithEquations ?? 'N/A'} |\n`;
    md += `| **Questions w/ Images** | ${before?.physics?.questionsWithImages ?? 'N/A'} | ${after?.physics?.questionsWithImages ?? 'N/A'} | ${before?.physicsCleaned?.questionsWithImages ?? 'N/A'} | ${after?.physicsCleaned?.questionsWithImages ?? 'N/A'} |\n`;
    md += `| **MCQ Question Type** | ${before?.physics?.mcqCount ?? 'N/A'} | ${after?.physics?.mcqCount ?? 'N/A'} | ${before?.physicsCleaned?.mcqCount ?? 'N/A'} | ${after?.physicsCleaned?.mcqCount ?? 'N/A'} |\n`;
    md += `| **MSQ Question Type** | ${before?.physics?.msqCount ?? 'N/A'} | ${after?.physics?.msqCount ?? 'N/A'} | ${before?.physicsCleaned?.msqCount ?? 'N/A'} | ${after?.physicsCleaned?.msqCount ?? 'N/A'} |\n`;
    md += `| **Numerical Question Type** | ${before?.physics?.numericalCount ?? 'N/A'} | ${after?.physics?.numericalCount ?? 'N/A'} | ${before?.physicsCleaned?.numericalCount ?? 'N/A'} | ${after?.physicsCleaned?.numericalCount ?? 'N/A'} |\n`;
    md += `| **Descriptive Question Type** | ${before?.physics?.descriptiveCount ?? 'N/A'} | ${after?.physics?.descriptiveCount ?? 'N/A'} | ${before?.physicsCleaned?.descriptiveCount ?? 'N/A'} | ${after?.physicsCleaned?.descriptiveCount ?? 'N/A'} |\n`;
    md += `| **Low Confidence / Review Required** | ${before?.physics?.lowConfidenceCount ?? 'N/A'} | ${after?.physics?.lowConfidenceCount ?? 'N/A'} | ${before?.physicsCleaned?.lowConfidenceCount ?? 'N/A'} | ${after?.physicsCleaned?.lowConfidenceCount ?? 'N/A'} |\n`;

    await fs.writeFile(path.join(__dirname, 'BENCHMARK_REPORT.md'), md);
    console.log(`Saved benchmark comparison report to: backend/src/extraction/benchmark/BENCHMARK_REPORT.md`);
  }
}

function normalizeAnswer(value) {
  return String(value || '')
    .split(/[,/&\s]+/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean)
    .sort()
    .join(',');
}

async function writeQualityReport({ currentRun, syntheticMetrics, physicsStats, cleanedStats }) {
  const categoryGroups = new Map();
  for (const metric of syntheticMetrics) {
    const group = categoryGroups.get(metric.category) || { total: 0, passed: 0 };
    group.total += 1;
    if (metric.success) group.passed += 1;
    categoryGroups.set(metric.category, group);
  }

  const score = (passed, total) => total ? `${((passed / total) * 100).toFixed(1)}%` : 'N/A';
  let md = `# ExamForge Document Intelligence Quality Report\n\n`;
  md += `Generated: ${currentRun.timestamp}\n\n`;
  md += `## Architecture Coverage\n\n`;
  md += `| Stage | Status |\n| --- | --- |\n`;
  md += `| Stage 0 Source detection | Implemented for DOCX, native PDF, scanned PDF, image, clipboard, HTML |\n`;
  md += `| Stage 1 Semantic document model | Implemented with paragraphs, lists, tables, images, equations, styles, numbering |\n`;
  md += `| Stage 2 Boundary detection | Deterministic structure-first detector with numbering, style, table, option, answer, passage signals |\n`;
  md += `| Stage 3 Classification | Implemented after reconstruction for MCQ, MSQ, numerical, integer, assertion-reason, match, matrix, comprehension, subjective |\n`;
  md += `| Stage 4 Answer detection | Implemented with confidence levels for explicit labels, tables, annotations, fallback review |\n`;
  md += `| Stage 5 Explanation detection | Implemented for multi-block solution/explanation/reason content |\n`;
  md += `| Stage 6 Math preservation | Integrated with existing OMML/MathML/LaTeX pipeline and confidence scoring |\n`;
  md += `| Stage 7 Image linking | Integrated with existing DOCX/HTML media mapping and semantic block links |\n`;
  md += `| Stage 8 Validation | Implemented before persistence with review fallback |\n`;
  md += `| Stage 9 Confidence | Implemented per boundary, answer, explanation, math, classification, validation |\n`;
  md += `| Stage 10 Benchmarks | Implemented synthetic plus JEE Main, JEE Advanced, NEET, CBSE fixtures |\n\n`;

  md += `## Benchmark Accuracy\n\n`;
  md += `| Category | Passed | Total | Accuracy |\n| --- | ---: | ---: | ---: |\n`;
  for (const [category, group] of categoryGroups.entries()) {
    md += `| ${category} | ${group.passed} | ${group.total} | ${score(group.passed, group.total)} |\n`;
  }

  const totalPassed = syntheticMetrics.filter((metric) => metric.success).length;
  md += `| Overall | ${totalPassed} | ${syntheticMetrics.length} | ${score(totalPassed, syntheticMetrics.length)} |\n\n`;

  md += `## Real Document Metrics\n\n`;
  md += `| Metric | Physics.docx | Physics_cleaned_dataset.docx |\n| --- | ---: | ---: |\n`;
  md += `| Extracted questions | ${physicsStats.count} | ${cleanedStats.count} |\n`;
  md += `| Options extracted | ${physicsStats.totalOptions} | ${cleanedStats.totalOptions} |\n`;
  md += `| Questions with answers | ${physicsStats.questionsWithAnswers} | ${cleanedStats.questionsWithAnswers} |\n`;
  md += `| Questions with explanations | ${physicsStats.questionsWithExplanations} | ${cleanedStats.questionsWithExplanations} |\n`;
  md += `| Questions with tables | ${physicsStats.questionsWithTables} | ${cleanedStats.questionsWithTables} |\n`;
  md += `| Questions with equations | ${physicsStats.questionsWithEquations} | ${cleanedStats.questionsWithEquations} |\n`;
  md += `| Questions with images | ${physicsStats.questionsWithImages} | ${cleanedStats.questionsWithImages} |\n`;
  md += `| Review required | ${physicsStats.reviewRequiredCount} | ${cleanedStats.reviewRequiredCount} |\n`;

  await fs.writeFile(path.join(__dirname, '../../../../QUALITY_REPORT.md'), md);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
