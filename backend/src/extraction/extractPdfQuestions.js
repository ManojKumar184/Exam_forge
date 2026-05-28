import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { splitTextIntoBlocks, normalizeQuestions, preprocessDocumentText } from './normalizeQuestions.js';
import { ocrService } from '../ocr/index.js';
import { logger } from '../utils/logger.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const MIN_TEXT_CHARS = 30;

/**
 * OCR fallback for scanned / image-only PDFs.
 */
export async function extractPdfWithOcrFallback(filePath, context = {}) {
  logger.info('PDF OCR fallback started', { filePath });
  const ocr = await ocrService.recognizePdfPages(filePath, { maxPages: context.maxOcrPages ?? 25 });

  const blocks = splitTextIntoBlocks(preprocessDocumentText(ocr.text));
  if (context.returnRawBlocks) {
    return {
      blocks,
      questions: [],
      warnings: ocr.warnings || [],
      usedOcr: true,
      rawText: ocr.rawText || ocr.text,
      rawTextLength: (ocr.rawText || ocr.text || '').length,
      pageCount: ocr.pageCount,
      ocrConfidence: ocr.confidence,
    };
  }

  const questions = await normalizeQuestions(blocks, {
    ...context,
    extractedFrom: 'pdf_ocr',
    sourceFile: path.basename(filePath),
  });

  for (const q of questions) {
    q.extractionWarnings = [
      ...(q.extractionWarnings || []),
      ...(ocr.warnings || []),
      'PDF extracted via OCR — verify layout and equations',
    ];
    q.status = 'needs_review';
    q.renderingMetadata = {
      ...(q.renderingMetadata || {}),
      ocr: {
        confidence: ocr.confidence,
        uncertainSpans: ocr.uncertainSpans,
        pageCount: ocr.pageCount,
        rawTextPreview: (ocr.rawText || '').slice(0, 3000),
      },
    };
    q.aiMetadata = { provider: 'tesseract', ocrConfidence: ocr.confidence };
  }

  return {
    questions,
    warnings: [
      'PDF processed with OCR (little or no embedded text)',
      ...(ocr.warnings || []),
      questions.length === 0 ? 'No questions detected after PDF OCR' : null,
    ].filter(Boolean),
    usedOcr: true,
    rawText: ocr.rawText || ocr.text,
    rawTextLength: (ocr.rawText || ocr.text || '').length,
    pageCount: ocr.pageCount,
    ocrConfidence: ocr.confidence,
  };
}

export async function extractPdfQuestions(filePath, context = {}) {
  const buffer = await fs.readFile(filePath);
  let data;

  try {
    data = await pdfParse(buffer);
  } catch (err) {
    logger.warn('PDF parse failed, using OCR', { error: err.message });
    return extractPdfWithOcrFallback(filePath, context);
  }

  const text = data.text || '';

  if (!text.trim() || text.trim().length < MIN_TEXT_CHARS) {
    logger.info('PDF has minimal text, using OCR fallback', { length: text.length });
    return extractPdfWithOcrFallback(filePath, context);
  }

  const blocks = splitTextIntoBlocks(preprocessDocumentText(text));
  if (context.returnRawBlocks) {
    return {
      blocks,
      questions: [],
      warnings: [],
      usedOcr: false,
      rawText: text,
      rawTextLength: text.length,
      pageCount: data.numpages,
    };
  }

  const questions = await normalizeQuestions(blocks, {
    ...context,
    extractedFrom: 'pdf',
    sourceFile: path.basename(filePath),
  });

  const warnings = [];
  if (questions.length === 0) {
    warnings.push('No question blocks in PDF text — retrying with OCR');
    const ocrResult = await extractPdfWithOcrFallback(filePath, context);
    if (ocrResult.questions?.length) return ocrResult;
    warnings.push('OCR fallback also found no questions');
  }

  return {
    questions,
    warnings,
    usedOcr: false,
    rawText: text,
    rawTextLength: text.length,
    pageCount: data.numpages,
  };
}
