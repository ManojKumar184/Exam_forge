import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { splitTextIntoBlocks, normalizeQuestions } from './normalizeQuestions.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * OCR fallback hook — Phase 4 (PaddleOCR / Mathpix / cloud APIs)
 */
export async function extractPdfWithOcrFallback(_filePath) {
  throw new Error('OCR fallback for PDF is not implemented yet (Phase 4).');
}

export async function extractPdfQuestions(filePath, context = {}) {
  const buffer = await fs.readFile(filePath);
  let data;

  try {
    data = await pdfParse(buffer);
  } catch (err) {
    return {
      questions: [],
      warnings: [`PDF parse failed: ${err.message}. OCR fallback not available yet.`],
      usedOcr: false,
      rawTextLength: 0,
    };
  }

  const text = data.text || '';

  if (!text.trim() || text.trim().length < 30) {
    return {
      questions: [],
      warnings: [
        'PDF has little or no text — may be scanned. OCR fallback not implemented (Phase 4).',
      ],
      usedOcr: false,
      rawTextLength: text.length,
    };
  }

  const blocks = splitTextIntoBlocks(text);
  const questions = normalizeQuestions(blocks, {
    ...context,
    extractedFrom: 'pdf',
    sourceFile: path.basename(filePath),
  });

  const warnings = [];
  if (questions.length === 0) {
    warnings.push('No question blocks detected in PDF text');
  }

  return {
    questions,
    warnings,
    usedOcr: false,
    rawTextLength: text.length,
    pageCount: data.numpages,
  };
}
