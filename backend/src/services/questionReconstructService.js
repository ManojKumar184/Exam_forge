import { env } from '../config/env.js';
import { recognizeImage } from '../ocr/tesseractOcr.js';
import { geminiReconstructCleanup } from '../ai/geminiReconstructCleanup.js';
import { mergePasteSources, cleanPlainText } from '../extraction/wordHtmlCleanup.js';
import { runStagesReconstruction } from '../extraction/reconstructionPipeline.js';
import { classifyQuestionMetadata } from '../ai/classifyQuestion.js';
import { logger } from '../utils/logger.js';
import { performance } from 'perf_hooks';

function dataUrlToBuffer(dataUrl) {
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid image data URL');
  return Buffer.from(m[2], 'base64');
}

function pickBestBlock(blocks) {
  if (!blocks?.length) return null;
  if (blocks.length === 1) return blocks[0];
  return blocks.reduce((best, b) => {
    const score = (b.lines || []).join('').length + (b.options?.length || 0) * 80;
    const bestScore = (best.lines || []).join('').length + (best.options?.length || 0) * 80;
    return score > bestScore ? b : best;
  });
}

function mergeGemini(parserRow, gemini) {
  if (!gemini) return parserRow;
  const merged = { ...parserRow };
  if (gemini.questionText?.trim()) merged.questionText = gemini.questionText.trim();
  if (gemini.questionLatex) merged.questionLatex = gemini.questionLatex;
  if (gemini.questionType) merged.questionType = gemini.questionType;
  if (Array.isArray(gemini.options) && gemini.options.length >= 2) {
    merged.options = gemini.options.map((o) => ({
      text: o.text || '',
      latex: o.latex || null,
      image: o.image || null,
    }));
  }
  if (gemini.subtype) {
    merged.renderingMetadata = {
      ...(merged.renderingMetadata || {}),
      subtype: gemini.subtype,
    };
    merged.tags = [...new Set([...(merged.tags || []), gemini.subtype, ...(gemini.tags || [])])];
  }
  if (gemini.numericalAnswer != null && gemini.numericalAnswer !== '') {
    merged.numericalAnswer = Number(gemini.numericalAnswer);
  }
  // If Gemini marks it as needing review
  if (gemini.tags && gemini.tags.includes('needs_review')) {
    merged.tags = [...new Set([...(merged.tags || []), 'needs_review'])];
  }
  return merged;
}

function resolveSubtype(row) {
  const fromMeta = row.renderingMetadata?.subtype;
  if (fromMeta) {
    if (fromMeta === 'integer' || fromMeta === 'integer_type') return 'integer';
    if (fromMeta === 'mcq_incomplete') return 'mcq_single';
    return fromMeta;
  }
  const tag = row.tags?.find((t) =>
    ['mcq_single', 'mcq_multiple', 'integer_type', 'integer', 'match_following', 'comprehension', 'numerical'].includes(t)
  );
  if (tag === 'integer_type') return 'integer';
  if (tag === 'numerical') return 'numerical';
  return tag || 'descriptive';
}

function calculateParserConfidence(row, warnings) {
  let confidence = 1.0;
  
  if (warnings && warnings.length) {
    confidence -= warnings.length * 0.15;
  }
  if (row.extractionWarnings && row.extractionWarnings.length) {
    confidence -= row.extractionWarnings.length * 0.15;
  }
  
  if (row.questionType === 'mcq') {
    if (!row.options || row.options.length < 2) {
      confidence -= 0.3;
    } else if (row.options.length !== 4) {
      confidence -= 0.1;
    }
  }
  
  if ((row.questionText || '').length < 15) {
    confidence -= 0.2;
  }
  
  return Math.max(0.1, Math.min(1.0, confidence));
}

async function buildFromCleanedPlain(cleanedPlain, cleanedHtml, ocrText = null, blocks = null, rawHtml = null) {
  // Log 2: Reconstruction pipeline input
  logger.info('[FORENSIC_LOG] 2. Reconstruction pipeline input', {
    inputs: {
      cleanedPlainLength: cleanedPlain?.length || 0,
      cleanedHtmlLength: cleanedHtml?.length || 0,
      ocrTextLength: ocrText?.length || 0,
      blocksCount: blocks?.length || 0,
      rawHtmlLength: rawHtml?.length || 0,
      plainSample: cleanedPlain?.slice(0, 100)
    }
  });

  const pipeline = await runStagesReconstruction(cleanedPlain, cleanedHtml, ocrText, blocks, rawHtml);

  const row = {
    questionText: pipeline.stem,
    questionType: pipeline.questionType,
    options: pipeline.options.map(o => ({
      text: o.text || '',
      latex: o.latex || null,
      image: o.image || null,
    })),
    tags: [pipeline.subtype, ...(pipeline.warnings.length > 0 ? ['needs_review'] : [])],
    renderingMetadata: { subtype: pipeline.subtype },
    extractionWarnings: pipeline.warnings,
    confidence: pipeline.confidence,
    debugInfo: pipeline.debugInfo || null,
    
    // SaaS semantic fields mapping
    correctAnswers: pipeline.correctAnswers || [],
    figures: pipeline.figures || [],
    formulas: pipeline.formulas || [],
    semanticBlocks: pipeline.semanticBlocks || [],
    statementGroups: pipeline.statementGroups || [],
    comprehensionLinks: pipeline.comprehensionLinks || [],
    parserConfidence: pipeline.confidence,
    reconstructionFidelity: pipeline.reconstructionFidelity || 0.8,
    semanticConfidence: pipeline.semanticConfidence || 1.0,
    mathPreservationConfidence: pipeline.mathPreservationConfidence || 1.0,
    metadataConfidence: pipeline.metadataConfidence || 1.0,
    
    // Structured temporary fields
    raw_stem: pipeline.stem,
    raw_options: pipeline.options.map(o => ({ text: o.text || '', latex: o.latex || null })),
    layout_blocks: [
      {
        lines: pipeline.stem.split('\n'),
        options: pipeline.options.map(o => o.text),
        passage: null,
        tags: [pipeline.subtype]
      }
    ],
  };

  return { row, cleanedHtml };
}

function toEditorPayload(row, cleanedHtml, imageUrls, sources, extraWarnings = []) {
  const subtype = resolveSubtype(row);
  const parser_confidence = calculateParserConfidence(row, extraWarnings);
  const ocr_confidence = sources.ocr ? 0.85 : null;

  return {
    questionText: row.questionText || '',
    questionHtml: cleanedHtml && cleanedHtml.length > 10 ? cleanedHtml : null,
    questionLatex: row.questionLatex || null,
    questionType: row.questionType || 'descriptive',
    subtype,
    options: (row.options || []).map((o) => ({
      text: o.text || '',
      latex: o.latex || null,
      image: o.image || null,
    })),
    tags: row.tags || [],
    questionImages: imageUrls || row.questionImages || [],
    numericalAnswer: row.numericalAnswer ?? null,
    correctOption: row.correctOption ?? null,
    warnings: [...(row.extractionWarnings || []), ...extraWarnings],
    sources,
    hasEquation: Boolean(row.hasEquation || row.questionLatex),
    
    // SaaS fields mapping
    correctAnswers: row.correctAnswers || [],
    figures: row.figures || [],
    formulas: row.formulas || [],
    semanticBlocks: row.semanticBlocks || [],
    statementGroups: row.statementGroups || [],
    comprehensionLinks: row.comprehensionLinks || [],
    parserConfidence: row.parserConfidence || parser_confidence,
    reconstructionFidelity: row.reconstructionFidelity || 0.8,
    semanticConfidence: row.semanticConfidence || 1.0,
    mathPreservationConfidence: row.mathPreservationConfidence || 1.0,
    metadataConfidence: row.metadataConfidence || 1.0,

    // Add temporary structured reconstruction state
    raw_stem: row.raw_stem || row.questionText || '',
    raw_options: row.raw_options || (row.options || []).map(o => ({ text: o.text || '', latex: o.latex || null })),
    layout_blocks: row.layout_blocks || [],
    parser_confidence,
    ocr_confidence,
    debugInfo: row.debugInfo || null,
  };
}

export async function reconstructQuestionInput(body) {
  const { html, plain, ocrText, images = [], blocks = null, rawHtml = null } = body;
  const sources = { parser: true, ocr: false, ollama: false };
  const warnings = [];

  const tIngestStart = performance.now();
  const cleaned = mergePasteSources({ html, plain, ocrText });
  const imageUrls = [...new Set([...(images || []), ...cleaned.images])].slice(0, 6);

  let mergedPlain = cleaned.plain;

  if (env.ocr.enabled && imageUrls.length) {
    for (const img of imageUrls) {
      if (!String(img).startsWith('data:')) continue;
      try {
        const ocr = await recognizeImage(dataUrlToBuffer(img));
        if (ocr.text?.trim()) {
          mergedPlain = `${mergedPlain}\n\n${cleanPlainText(ocr.text)}`.trim();
          sources.ocr = true;
          if (ocr.warnings?.length) warnings.push(...ocr.warnings);
        }
      } catch (err) {
        warnings.push(`Image OCR failed: ${err.message}`);
      }
    }
  }
  const ingestionMs = Math.round(performance.now() - tIngestStart);

  if (!mergedPlain?.trim()) {
    return {
      questionText: '',
      questionHtml: cleaned.html || null,
      questionType: 'descriptive',
      subtype: 'descriptive',
      options: [],
      tags: [],
      questionImages: imageUrls,
      warnings: ['No text to reconstruct'],
      sources,
      raw_stem: '',
      raw_options: [],
      layout_blocks: [],
      parser_confidence: 0.1,
      ocr_confidence: null,
      debugInfo: null,
      correctAnswers: [],
      figures: [],
      formulas: [],
      semanticBlocks: [],
      statementGroups: [],
      comprehensionLinks: [],
      parserConfidence: 0.1,
      reconstructionFidelity: 0.1,
    };
  }

  const tReconstructStart = performance.now();
  const { row, cleanedHtml } = await buildFromCleanedPlain(mergedPlain, cleaned.html, ocrText, blocks, rawHtml || html);

  const reconstructionMs = Math.round(performance.now() - tReconstructStart);

  if (row.debugInfo?.stages?.stage9?.refined) {
    sources.ollama = true;
  }
  if (row.debugInfo?.stages?.stage9?.warnings) {
    warnings.push(...row.debugInfo.stages.stage9.warnings);
  }

  const tClassifyStart = performance.now();
  let classificationResult = null;
  try {
    classificationResult = await classifyQuestionMetadata(row, null);
  } catch (err) {
    logger.warn('Failed to run classification in reconstruct service', { error: err.message });
  }
  const classificationMs = Math.round(performance.now() - tClassifyStart);

  row.debugInfo = {
    ...(row.debugInfo || {}),
    timings: {
      ingestionMs,
      reconstructionMs,
      classificationMs,
    },
    classification: classificationResult,
  };

  return toEditorPayload(row, cleanedHtml, imageUrls, sources, warnings);
}
