import { compactPreview, equationSignatures, semanticSimilarity, tableSignature } from './textSemantics.js';

const THRESHOLDS = {
  boundary: 0.62,
  stem: 0.72,
  option: 0.7,
  equation: 0.65,
  table: 0.65,
};

export function compareSourceToExtracted(sourceQuestions, extractedQuestions, file) {
  const extracted = extractedQuestions.map((question, index) => normalizeExtractedQuestion(question, file, index + 1));
  const matches = alignQuestions(sourceQuestions, extracted);
  const comparisons = [];
  const matchedExtracted = new Set();

  for (const match of matches) {
    if (match.extracted) matchedExtracted.add(match.extracted.id);
    comparisons.push(comparePair(match.source, match.extracted, match.score));
  }

  for (const question of extracted) {
    if (!matchedExtracted.has(question.id)) {
      comparisons.push(comparePair(null, question, 0));
    }
  }

  return {
    file,
    sourceCount: sourceQuestions.length,
    extractedCount: extracted.length,
    questionCountCorrect: sourceQuestions.length === extracted.length,
    comparisons,
    metrics: aggregateMetrics(comparisons, sourceQuestions.length, extracted.length),
    failures: clusterFailures(comparisons, file),
  };
}

function alignQuestions(sourceQuestions, extractedQuestions) {
  const candidates = [];
  for (const source of sourceQuestions) {
    for (const extracted of extractedQuestions) {
      const numberBonus = source.questionNumber && extracted.questionNumber && source.questionNumber === extracted.questionNumber ? 0.12 : 0;
      const score = Math.min(1, semanticSimilarity(source.stem, extracted.stem) + numberBonus);
      candidates.push({ source, extracted, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const usedSource = new Set();
  const usedExtracted = new Set();
  const matches = [];
  for (const candidate of candidates) {
    if (candidate.score < 0.28) continue;
    if (usedSource.has(candidate.source.id) || usedExtracted.has(candidate.extracted.id)) continue;
    matches.push(candidate);
    usedSource.add(candidate.source.id);
    usedExtracted.add(candidate.extracted.id);
  }
  for (const source of sourceQuestions) {
    if (!usedSource.has(source.id)) matches.push({ source, extracted: null, score: 0 });
  }
  matches.sort((a, b) => (a.source?.index || 999999) - (b.source?.index || 999999));
  return matches;
}

function comparePair(source, extracted, alignmentScore) {
  const stemScore = source && extracted ? semanticSimilarity(source.stem, extracted.stem) : 0;
  const optionComparison = compareOptions(source?.options || [], extracted?.options || []);
  const typeCorrect = Boolean(source && extracted && normalizeType(source.questionType) === normalizeType(extracted.questionType));
  const equationCorrect = compareEquationPreservation(source, extracted);
  const imageCorrect = compareImageAssociation(source, extracted);
  const tableCorrect = compareTablePreservation(source, extracted);
  const boundaryCorrect = Boolean(source && extracted && alignmentScore >= THRESHOLDS.boundary);

  const failures = [];
  if (!source) failures.push('extra_question');
  if (!extracted) failures.push('missing_question');
  if (source && extracted && !boundaryCorrect) failures.push('wrong_question_boundary');
  if (source && extracted && stemScore < THRESHOLDS.stem) failures.push('stem_mismatch');
  failures.push(...optionComparison.failures);
  if (source && extracted && !typeCorrect) failures.push(`${normalizeType(source.questionType).toLowerCase()}_classified_as_${normalizeType(extracted.questionType).toLowerCase()}`);
  if (!equationCorrect) failures.push('equation_corruption');
  if (!imageCorrect) failures.push('image_detachment');
  if (!tableCorrect) failures.push('table_flattening');

  return {
    questionId: source?.id || extracted?.id,
    sourceQuestion: compactPreview(source?.sourceQuestion || ''),
    extractedQuestion: compactPreview(extracted?.sourceQuestion || ''),
    sourceQuestionNumber: source?.questionNumber || null,
    extractedQuestionNumber: extracted?.questionNumber || null,
    comparisonResults: {
      alignmentScore,
      questionBoundaryCorrect: boundaryCorrect,
      stemCorrect: stemScore >= THRESHOLDS.stem,
      stemScore,
      optionsCorrect: optionComparison.optionsCorrect,
      optionCountCorrect: optionComparison.optionCountCorrect,
      optionOrderingCorrect: optionComparison.optionOrderingCorrect,
      optionScores: optionComparison.optionScores,
      questionTypeCorrect: typeCorrect,
      equationPreservationCorrect: equationCorrect,
      imageAssociationCorrect: imageCorrect,
      tablePreservationCorrect: tableCorrect,
    },
    failures,
    detailedDiff: buildDiff(source, extracted, optionComparison),
  };
}

function normalizeExtractedQuestion(question, file, index) {
  const options = (question.options || []).map((option, optionIndex) => ({
    label: String.fromCharCode(65 + optionIndex),
    text: option?.text || '',
  }));
  return {
    id: `${file}::extracted::${index}`,
    sourceFile: file,
    index,
    questionNumber: question.renderingMetadata?.questionNumber || numberFromTags(question.tags) || null,
    sourceQuestion: [
      question.questionText,
      ...options.map((option) => `${option.label}. ${option.text}`),
    ].filter(Boolean).join('\n'),
    stem: question.questionText || '',
    options,
    questionType: question.questionType || 'DESCRIPTIVE',
    equations: [...(question.formulas || []), question.questionLatex].filter(Boolean),
    images: question.questionImages || [],
    tables: question.renderingMetadata?.tables || [],
    hasDiagram: Boolean(question.hasDiagram || question.questionImages?.length),
    hasTable: Boolean(question.hasTable || question.renderingMetadata?.tables?.length),
  };
}

function compareOptions(sourceOptions, extractedOptions) {
  const optionScores = [];
  const count = Math.max(sourceOptions.length, extractedOptions.length);
  for (let i = 0; i < count; i++) {
    const source = sourceOptions[i];
    const extracted = extractedOptions[i];
    optionScores.push({
      index: i + 1,
      sourceLabel: source?.label || null,
      extractedLabel: extracted?.label || null,
      score: source && extracted ? semanticSimilarity(source.text, extracted.text) : 0,
      sourceText: compactPreview(source?.text || '', 120),
      extractedText: compactPreview(extracted?.text || '', 120),
    });
  }
  const optionCountCorrect = sourceOptions.length === extractedOptions.length;
  const optionOrderingCorrect = optionScores.every((score) => !score.sourceLabel || !score.extractedLabel || score.sourceLabel === score.extractedLabel);
  const contentCorrect = optionScores.every((score) => score.score >= THRESHOLDS.option);
  const failures = [];

  if (!optionCountCorrect) {
    failures.push(sourceOptions.length > extractedOptions.length ? 'lost_option' : 'option_split');
  }
  if (!optionOrderingCorrect) failures.push('option_ordering_error');
  if (optionCountCorrect && !contentCorrect) failures.push('option_merge');

  return {
    optionsCorrect: optionCountCorrect && optionOrderingCorrect && contentCorrect,
    optionCountCorrect,
    optionOrderingCorrect,
    optionScores,
    failures,
  };
}

function compareEquationPreservation(source, extracted) {
  if (!source?.hasEquation) return true;
  const sourceSigs = equationSignatures(source.sourceQuestion);
  const extractedSigs = equationSignatures([extracted?.stem, ...(extracted?.equations || [])].join('\n'));
  if (!sourceSigs.length) return true;
  if (!extractedSigs.length) return false;
  const best = Math.max(...sourceSigs.map((sig) => Math.max(...extractedSigs.map((other) => semanticSimilarity(sig, other)))));
  return best >= THRESHOLDS.equation;
}

function compareImageAssociation(source, extracted) {
  if (!source?.hasImageReference) return true;
  return Boolean(extracted?.hasDiagram || extracted?.images?.length);
}

function compareTablePreservation(source, extracted) {
  if (!source?.hasTableReference) return true;
  if (!extracted?.hasTable && !extracted?.tables?.length) return false;
  const signatures = extracted.tables.map(tableSignature).filter(Boolean);
  return signatures.length > 0 || extracted.hasTable;
}

function aggregateMetrics(comparisons, sourceCount, extractedCount) {
  const matched = comparisons.filter((item) => item.sourceQuestion && item.extractedQuestion);
  const denom = Math.max(sourceCount, 1);
  const metric = (predicate, list = comparisons) => {
    const relevant = list.length || 1;
    return list.filter(predicate).length / relevant;
  };
  const questionDetectionAccuracy = Math.min(sourceCount, matched.length) / denom;
  return {
    questionDetectionAccuracy,
    questionBoundaryAccuracy: metric((item) => item.comparisonResults.questionBoundaryCorrect),
    questionCountAccuracy: sourceCount === extractedCount ? 1 : Math.max(0, 1 - Math.abs(sourceCount - extractedCount) / denom),
    stemAccuracy: metric((item) => item.comparisonResults.stemCorrect, matched),
    optionDetectionAccuracy: metric((item) => item.comparisonResults.optionsCorrect, matched),
    optionOrderingAccuracy: metric((item) => item.comparisonResults.optionOrderingCorrect, matched),
    questionTypeAccuracy: metric((item) => item.comparisonResults.questionTypeCorrect, matched),
    equationPreservationAccuracy: metric((item) => item.comparisonResults.equationPreservationCorrect, matched),
    imagePreservationAccuracy: metric((item) => item.comparisonResults.imageAssociationCorrect, matched),
    tablePreservationAccuracy: metric((item) => item.comparisonResults.tablePreservationCorrect, matched),
  };
}

export function summarizeRun(fileResults) {
  const totals = {};
  const metricNames = [
    'questionDetectionAccuracy',
    'questionBoundaryAccuracy',
    'questionCountAccuracy',
    'stemAccuracy',
    'optionDetectionAccuracy',
    'optionOrderingAccuracy',
    'questionTypeAccuracy',
    'equationPreservationAccuracy',
    'imagePreservationAccuracy',
    'tablePreservationAccuracy',
  ];
  for (const name of metricNames) totals[name] = [];
  for (const result of fileResults) {
    for (const name of metricNames) totals[name].push(result.metrics[name] ?? 0);
  }
  const summary = {};
  for (const [name, values] of Object.entries(totals)) {
    summary[name] = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  }
  summary.overallExtractionAccuracy = metricNames.reduce((sum, name) => sum + summary[name], 0) / metricNames.length;
  return summary;
}

export function clusterFailures(comparisons, file) {
  const clusters = new Map();
  for (const comparison of comparisons) {
    for (const failure of comparison.failures || []) {
      const cluster = clusters.get(failure) || {
        failureMode: failure,
        frequency: 0,
        severity: severityForFailure(failure),
        affectedFiles: new Set(),
        examples: [],
        rootCause: rootCauseForFailure(failure),
        codeLocation: codeLocationForFailure(failure),
      };
      cluster.frequency += 1;
      cluster.affectedFiles.add(file);
      if (cluster.examples.length < 3) cluster.examples.push(comparison.questionId);
      clusters.set(failure, cluster);
    }
  }
  return [...clusters.values()].map((cluster) => ({
    ...cluster,
    affectedFiles: [...cluster.affectedFiles],
  }));
}

function buildDiff(source, extracted, optionComparison) {
  return {
    stem: {
      source: compactPreview(source?.stem || ''),
      extracted: compactPreview(extracted?.stem || ''),
      similarity: source && extracted ? semanticSimilarity(source.stem, extracted.stem) : 0,
    },
    options: optionComparison.optionScores,
    sourceType: source?.questionType || null,
    extractedType: extracted?.questionType || null,
  };
}

function normalizeType(type) {
  const value = String(type || 'DESCRIPTIVE').toUpperCase();
  if (value === 'MCQ') return 'MCQ_SINGLE';
  if (value === 'DESCRIPTIVE') return 'DESCRIPTIVE';
  return value;
}

function numberFromTags(tags = []) {
  for (const tag of tags) {
    if (String(tag).startsWith('qnum:')) {
      const value = Number(String(tag).slice(5));
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

function severityForFailure(failure) {
  if (failure.includes('missing') || failure.includes('boundary')) return 'critical';
  if (failure.includes('lost_option') || failure.includes('option')) return 'high';
  if (failure.includes('equation') || failure.includes('image') || failure.includes('table')) return 'high';
  if (failure.includes('classified')) return 'medium';
  return 'medium';
}

function rootCauseForFailure(failure) {
  if (failure === 'missing_question') return 'Source question had no aligned extracted object above semantic threshold.';
  if (failure === 'wrong_question_boundary') return 'Question start/end reconstruction merged or split adjacent semantic content.';
  if (failure === 'lost_option') return 'Detected option count is lower than source option count.';
  if (failure === 'option_split') return 'Detected option count is higher than source option count.';
  if (failure === 'option_merge') return 'Option content differs semantically despite matching count.';
  if (failure === 'option_ordering_error') return 'Option labels/order changed during extraction.';
  if (failure === 'equation_corruption') return 'Source math signatures were not preserved in extracted stem/formula fields.';
  if (failure === 'image_detachment') return 'Source references a figure/diagram but extracted object has no image association.';
  if (failure === 'table_flattening') return 'Source references a table but extracted object lacks table metadata.';
  if (failure.includes('classified_as')) return 'Question type classifier disagreed with source structural cues.';
  return 'Semantic comparison below threshold.';
}

function codeLocationForFailure(failure) {
  if (failure.includes('boundary') || failure === 'missing_question') return 'backend/src/extraction/normalizeQuestions.js; backend/src/extraction/documentIntelligence/boundaryDetector.js';
  if (failure.includes('option')) return 'backend/src/extraction/optionParser.js; backend/src/extraction/mcqOptionExtract.js';
  if (failure.includes('classified')) return 'backend/src/extraction/detectQuestionType.js; backend/src/extraction/documentIntelligence/questionTypeClassifier.js';
  if (failure.includes('equation')) return 'backend/src/extraction/mathConverter.js; backend/src/extraction/docxMathHtml.js';
  if (failure.includes('image')) return 'backend/src/extraction/htmlQuestionParser.js; backend/src/extraction/extractDocxQuestions.js';
  if (failure.includes('table')) return 'backend/src/extraction/docxAdvancedParser.js; backend/src/extraction/docxMathHtml.js';
  return 'backend/src/extraction';
}
