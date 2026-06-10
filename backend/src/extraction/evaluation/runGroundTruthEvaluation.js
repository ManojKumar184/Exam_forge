import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractionService } from '../index.js';
import { readOriginalSource, buildSourceQuestions } from './sourceOracle.js';
import { compareSourceToExtracted, summarizeRun } from './semanticComparator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..', '..');
const OUT_DIR = path.join(__dirname, 'results');

const DATASETS = [
  { file: 'test_image1.png', kind: 'image', type: 'image' },
  { file: 'test_image2.png', kind: 'image', type: 'image' },
  { file: 'jee_mains.pdf', aliases: ['jeemains.pdf'], kind: 'pdf', type: 'pdf' },
  { file: 'Physics.docx', aliases: ['physics.docx'], kind: 'docx', type: 'docx' },
  { file: 'Physics_cleaned_dataset.docx', aliases: ['physics_cleaned_dataset.docx'], kind: 'docx', type: 'docx' },
];

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  if (process.argv.includes('--after-only')) {
    const before = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'before_legacy.json'), 'utf8'));
    const after = await runMode('after_current', { useLegacyExtraction: false });
    await writeReports('after', after, before);
    return;
  }

  const before = await runMode('before_legacy', { useLegacyExtraction: true });
  await writeReports('before', before, null);

  const shouldRunAfter = process.argv.includes('--after') || process.argv.includes('--both');
  if (shouldRunAfter) {
    const after = await runMode('after_current', { useLegacyExtraction: false });
    await writeReports('after', after, before);
  }
}

async function runMode(mode, context = {}) {
  const fileResults = [];
  for (const dataset of DATASETS) {
    const filePath = await resolveDatasetPath(dataset);
    if (!filePath) {
      fileResults.push({
        file: dataset.file,
        missing: true,
        sourceCount: 0,
        extractedCount: 0,
        comparisons: [],
        metrics: emptyMetrics(),
        failures: [{
          failureMode: 'dataset_missing',
          frequency: 1,
          severity: 'critical',
          affectedFiles: [dataset.file],
          rootCause: 'Dataset file was not found in workspace.',
          codeLocation: 'workspace dataset setup',
          examples: [],
        }],
      });
      continue;
    }

    console.log(`[evaluation:${mode}] Reading source ${path.basename(filePath)}`);
    const source = await readOriginalSource(filePath, dataset.kind);
    const sourceQuestions = buildSourceQuestions(source);

    console.log(`[evaluation:${mode}] Extracting ${path.basename(filePath)}`);
    let extracted = null;
    let extractionError = null;
    try {
      extracted = await extractionService.processFile(filePath, dataset.type, {
        ...context,
        skipLlm: true,
        sourceFile: path.basename(filePath),
        filename: path.basename(filePath),
        maxOcrPages: 8,
      });
    } catch (err) {
      extractionError = err;
    }

    const result = compareSourceToExtracted(sourceQuestions, extracted?.questions || [], path.basename(filePath));
    result.sourceObservation = {
      method: source.extractionMethod,
      sourceTextLength: source.text?.length || 0,
      pageCount: source.pageCount || null,
      ocrConfidence: source.ocrConfidence || null,
    };
    result.extractionObservation = {
      mode: extracted?.extractionMode || null,
      usedOcr: Boolean(extracted?.usedOcr),
      warnings: extracted?.warnings || [],
      error: extractionError?.message || null,
    };
    if (extractionError) {
      result.failures.push({
        failureMode: 'source_extraction_crash',
        frequency: 1,
        severity: 'critical',
        affectedFiles: [path.basename(filePath)],
        rootCause: extractionError.message,
        codeLocation: dataset.kind === 'pdf' ? 'backend/src/extraction/extractPdfQuestions.js; backend/src/ocr/pdfToImages.js' : 'backend/src/extraction',
        examples: [path.basename(filePath)],
      });
    }
    fileResults.push(result);
  }

  const run = {
    mode,
    timestamp: new Date().toISOString(),
    datasets: DATASETS.map((dataset) => dataset.file),
    files: fileResults,
    summary: summarizeRun(fileResults),
    failureClusters: aggregateFailureClusters(fileResults),
  };
  await fs.writeFile(path.join(OUT_DIR, `${mode}.json`), JSON.stringify(run, null, 2));
  return run;
}

async function resolveDatasetPath(dataset) {
  const names = [dataset.file, ...(dataset.aliases || [])];
  for (const name of names) {
    const candidate = path.join(ROOT, name);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next alias
    }
  }
  return null;
}

function aggregateFailureClusters(fileResults) {
  const clusters = new Map();
  for (const result of fileResults) {
    for (const failure of result.failures || []) {
      const existing = clusters.get(failure.failureMode) || {
        failureMode: failure.failureMode,
        frequency: 0,
        severity: failure.severity,
        affectedFiles: new Set(),
        rootCause: failure.rootCause,
        codeLocation: failure.codeLocation,
        examples: [],
      };
      existing.frequency += failure.frequency;
      for (const file of failure.affectedFiles || []) existing.affectedFiles.add(file);
      existing.examples.push(...(failure.examples || []));
      clusters.set(failure.failureMode, existing);
    }
  }
  return [...clusters.values()]
    .map((cluster) => ({
      ...cluster,
      affectedFiles: [...cluster.affectedFiles],
      examples: cluster.examples.slice(0, 5),
      estimatedQuestionDetectionImpact: estimateImpact(cluster),
      estimatedOptionDetectionImpact: estimateOptionImpact(cluster),
    }))
    .sort((a, b) => b.frequency - a.frequency);
}

function estimateImpact(cluster) {
  if (cluster.failureMode === 'missing_question' || cluster.failureMode === 'wrong_question_boundary') {
    return cluster.frequency;
  }
  return 0;
}

function estimateOptionImpact(cluster) {
  if (cluster.failureMode.includes('option') || cluster.failureMode === 'lost_option') return cluster.frequency;
  return 0;
}

async function writeReports(label, run, beforeRun) {
  await fs.writeFile(path.join(ROOT, 'GROUND_TRUTH_EVALUATION.md'), renderGroundTruthEvaluation(run));
  await fs.writeFile(path.join(ROOT, 'EXTRACTION_FAILURE_ANALYSIS.md'), renderFailureAnalysis(run));
  if (beforeRun) {
    await fs.writeFile(path.join(ROOT, 'ACCURACY_IMPROVEMENT_REPORT.md'), renderImprovementReport(beforeRun, run));
  } else {
    await fs.writeFile(path.join(ROOT, 'ACCURACY_IMPROVEMENT_REPORT.md'), renderImprovementReport(run, null));
  }
  await fs.writeFile(path.join(OUT_DIR, `${label}_summary.json`), JSON.stringify(run.summary, null, 2));
}

function renderGroundTruthEvaluation(run) {
  let md = `# Ground Truth Evaluation\n\n`;
  md += `Generated: ${run.timestamp}\n\n`;
  md += `## Methodology\n\n`;
  md += `This framework reads each original source document with an independent source-observation reader, extracts Question Objects with ExamForge ingestion, aligns source candidates to extracted objects by semantic token/LCS similarity, and scores structure-preserving metrics. It does not compare parser output to itself and does not use simple string equality for correctness.\n\n`;
  md += `For images, the source observation is OCR-based because the original source is raster. That makes image evaluations useful for ingestion regression, but they still require human-labeled answer keys for final certification.\n\n`;
  md += `## Dataset Coverage\n\n`;
  md += `| File | Source Questions | Extracted Questions | Source Reader | Extraction Mode |\n| --- | ---: | ---: | --- | --- |\n`;
  for (const file of run.files) {
    md += `| ${file.file} | ${file.sourceCount} | ${file.extractedCount} | ${file.sourceObservation?.method || 'missing'} | ${file.extractionObservation?.mode || 'n/a'} |\n`;
  }
  md += `\n## Metrics\n\n${renderMetricTable(run.summary)}\n`;
  md += `\n## Per-Question Results\n\n`;
  for (const file of run.files) {
    md += `### ${file.file}\n\n`;
    md += `| Question ID | Boundary | Stem | Options | Ordering | Type | Equation | Image | Table |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
    for (const item of file.comparisons) {
      const r = item.comparisonResults;
      md += `| ${item.questionId || 'unmatched'} | ${mark(r.questionBoundaryCorrect)} | ${mark(r.stemCorrect)} | ${mark(r.optionsCorrect)} | ${mark(r.optionOrderingCorrect)} | ${mark(r.questionTypeCorrect)} | ${mark(r.equationPreservationCorrect)} | ${mark(r.imageAssociationCorrect)} | ${mark(r.tablePreservationCorrect)} |\n`;
    }
    md += `\n`;
  }
  return md;
}

function renderFailureAnalysis(run) {
  let md = `# Extraction Failure Analysis\n\n`;
  md += `Generated: ${run.timestamp}\n\n`;
  md += `## Failure Clusters\n\n`;
  md += `| Rank | Failure Mode | Frequency | Severity | Affected Files | Root Cause | Code Location |\n| ---: | --- | ---: | --- | --- | --- | --- |\n`;
  run.failureClusters.forEach((cluster, index) => {
    md += `| ${index + 1} | ${cluster.failureMode} | ${cluster.frequency} | ${cluster.severity} | ${cluster.affectedFiles.join(', ')} | ${cluster.rootCause} | ${cluster.codeLocation} |\n`;
  });
  md += `\n## Top 20 Failure Modes Blocking 99% Question and Option Detection\n\n`;
  md += `| Rank | Failure Mode | Current Impact | Option Impact | Examples |\n| ---: | --- | ---: | ---: | --- |\n`;
  run.failureClusters.slice(0, 20).forEach((cluster, index) => {
    md += `| ${index + 1} | ${cluster.failureMode} | -${cluster.estimatedQuestionDetectionImpact} questions | -${cluster.estimatedOptionDetectionImpact} option cases | ${cluster.examples.join(', ')} |\n`;
  });
  md += `\n## Detailed Diffs\n\n`;
  for (const file of run.files) {
    md += `### ${file.file}\n\n`;
    for (const item of file.comparisons.filter((comparison) => comparison.failures.length)) {
      md += `#### ${item.questionId}\n\n`;
      md += `Failures: ${item.failures.join(', ')}\n\n`;
      md += `Source: ${item.sourceQuestion}\n\n`;
      md += `Extracted: ${item.extractedQuestion}\n\n`;
      md += `Stem similarity: ${percent(item.detailedDiff.stem.similarity)}\n\n`;
    }
  }
  return md;
}

function renderImprovementReport(beforeRun, afterRun) {
  let md = `# Accuracy Improvement Report\n\n`;
  md += `Generated: ${new Date().toISOString()}\n\n`;
  if (!afterRun) {
    md += `Only the before/baseline evaluation has been generated so far. Run the evaluator with \`--after\` after targeted fixes to populate improvement deltas.\n\n`;
    md += `## Before Metrics\n\n${renderMetricTable(beforeRun.summary)}\n`;
    return md;
  }
  md += `## Before Accuracy\n\n${renderMetricTable(beforeRun.summary)}\n`;
  md += `\n## After Accuracy\n\n${renderMetricTable(afterRun.summary)}\n`;
  md += `\n## Improvement Per Metric\n\n`;
  md += `| Metric | Before | After | Improvement |\n| --- | ---: | ---: | ---: |\n`;
  for (const key of Object.keys(afterRun.summary)) {
    const before = beforeRun.summary[key] || 0;
    const after = afterRun.summary[key] || 0;
    md += `| ${humanMetric(key)} | ${percent(before)} | ${percent(after)} | ${percent(after - before)} |\n`;
  }
  md += `\n## Remaining Bottlenecks\n\n`;
  for (const cluster of afterRun.failureClusters.slice(0, 10)) {
    md += `- ${cluster.failureMode}: ${cluster.frequency} cases across ${cluster.affectedFiles.join(', ')}. ${cluster.rootCause}\n`;
  }
  return md;
}

function renderMetricTable(summary) {
  let md = `| Metric | Accuracy |\n| --- | ---: |\n`;
  for (const [key, value] of Object.entries(summary)) {
    md += `| ${humanMetric(key)} | ${percent(value)} |\n`;
  }
  return md;
}

function humanMetric(key) {
  const words = [];
  let current = '';
  for (const ch of key) {
    if (ch >= 'A' && ch <= 'Z') {
      if (current) words.push(current);
      current = ch.toLowerCase();
    } else {
      current += ch;
    }
  }
  if (current) words.push(current);
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function percent(value) {
  return `${((value || 0) * 100).toFixed(2)}%`;
}

function mark(value) {
  return value ? 'PASS' : 'FAIL';
}

function emptyMetrics() {
  return {
    questionDetectionAccuracy: 0,
    questionBoundaryAccuracy: 0,
    questionCountAccuracy: 0,
    stemAccuracy: 0,
    optionDetectionAccuracy: 0,
    optionOrderingAccuracy: 0,
    questionTypeAccuracy: 0,
    equationPreservationAccuracy: 0,
    imagePreservationAccuracy: 0,
    tablePreservationAccuracy: 0,
    overallExtractionAccuracy: 0,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
