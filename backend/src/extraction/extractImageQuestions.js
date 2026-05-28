import path from 'path';
import { ocrService } from '../ocr/index.js';
import { reconstructOcrReadingOrder } from './columnReadingOrder.js';
import { splitTextIntoBlocks, normalizeQuestions, preprocessDocumentText } from './normalizeQuestions.js';
import { logger } from '../utils/logger.js';

export async function extractImageQuestions(filePath, context = {}) {
  const result = await ocrService.recognizeFile(filePath);

  const ordered = preprocessDocumentText(
    result.words?.length ? reconstructOcrReadingOrder(result.words) : result.text
  );
  const blocks = splitTextIntoBlocks(ordered);
  if (context.returnRawBlocks) {
    return {
      blocks,
      questions: [],
      warnings: result.warnings || [],
      usedOcr: true,
      rawText: result.rawText,
      rawTextLength: result.rawText?.length || 0,
      ocrConfidence: result.confidence,
    };
  }
  const questions = await normalizeQuestions(blocks, {
    ...context,
    extractedFrom: 'image_ocr',
    sourceFile: path.basename(filePath),
  });

  for (const q of questions) {
    q.extractionWarnings = [
      ...(q.extractionWarnings || []),
      ...(result.warnings || []),
      'Extracted via OCR — verify text and equations',
    ];
    q.status = 'needs_review';
    q.hasEquation = Boolean(q.hasEquation || result.hasEquation);
    if (result.questionLatex && !q.questionLatex) {
      q.questionLatex = result.questionLatex;
    }
    q.renderingMetadata = {
      ...(q.renderingMetadata || {}),
      ocr: {
        confidence: result.confidence,
        uncertainSpans: result.uncertainSpans,
        rawTextPreview: (result.rawText || '').slice(0, 2000),
      },
    };
    q.aiMetadata = {
      provider: 'tesseract',
      ocrConfidence: result.confidence,
    };
  }

  if (questions.length === 0) {
    logger.warn('OCR produced no question blocks', { filePath });
  }

  return {
    questions,
    warnings: [
      ...(result.warnings || []),
      questions.length === 0 ? 'No questions detected after OCR' : null,
    ].filter(Boolean),
    usedOcr: true,
    rawText: result.rawText,
    rawTextLength: result.rawText?.length || 0,
    ocrConfidence: result.confidence,
  };
}
