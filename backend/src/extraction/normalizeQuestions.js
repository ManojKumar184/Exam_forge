import { detectQuestionType } from './detectQuestionType.js';
import { computeDuplicateHash } from '../utils/duplicateHash.js';
import { enrichTextWithLatexFields, enrichOptionWithLatex } from './latexUtils.js';

const OPTION_PATTERN = /^\s*(?:\(?\s*([A-Da-d])\s*\)?[\).:]\s*)(.+)$/;

export function splitTextIntoBlocks(rawText) {
  if (!rawText?.trim()) return [];

  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const blocks = [];
  let current = { lines: [], options: [] };

  const isQuestionStart = (line) =>
    /^(?:Q(?:uestion)?\s*)?\d{1,3}[\).:\-\s]/i.test(line) ||
    /^\d{1,3}[\).]\s+[A-Z]/.test(line);

  for (const line of lines) {
    const opt = line.match(OPTION_PATTERN);
    if (opt) {
      current.options.push({ text: opt[2].trim(), image: null, latex: null });
      continue;
    }

    if (isQuestionStart(line) && current.lines.length > 0) {
      blocks.push(current);
      current = { lines: [], options: [] };
    }
    current.lines.push(line.replace(/^(?:Q(?:uestion)?\s*)?\d{1,3}[\).:\-\s]+/i, '').trim());
  }

  if (current.lines.length > 0) blocks.push(current);
  return blocks;
}

export function normalizeQuestions(rawBlocks, context = {}) {
  const normalized = [];

  for (const block of rawBlocks) {
    const questionText = block.lines.join('\n').trim();
    if (!questionText || questionText.length < 10) continue;

    const questionType = detectQuestionType(block);
    const warnings = [];

    if (questionText.length < 20) warnings.push('Short question text — verify extraction');
    if (questionType === 'mcq' && block.options.length < 2) {
      warnings.push('MCQ detected but fewer than 2 options found');
    }

    let correctOption = null;
    let answerText = block.answerKey || null;

    const answerMatch = questionText.match(/(?:answer|ans|correct)\s*[:\-]?\s*([A-Da-d])/i);
    if (answerMatch) {
      correctOption = answerMatch[1].toUpperCase().charCodeAt(0) - 65;
      answerText = answerMatch[1].toUpperCase();
    }

    const status = warnings.length > 0 ? 'needs_review' : 'pending';

    const base = {
      questionText,
      questionType,
      options: block.options.length ? block.options.map(enrichOptionWithLatex) : [],
      correctOption,
      answerText,
      answerKey: answerText,
      class: context.class || 11,
      difficulty: context.difficulty || 'medium',
      marks: context.marks || 4,
      status,
      extractionWarnings: warnings,
      duplicateHash: computeDuplicateHash(questionText),
      questionImages: block.images || [],
      diagrams: block.diagrams || [],
      hasDiagram: Boolean(block.images?.length || block.diagrams?.length),
      hasTable: Boolean(block.hasTable),
      source: context.source || 'upload',
      sourceFile: context.sourceFile || null,
      extractedFrom: context.extractedFrom || null,
    };
    enrichTextWithLatexFields(questionText, base);
    if (base.questionImages?.length) {
      base.imageMetadata = base.questionImages.map((url, order) => ({
        url,
        order,
        caption: null,
        type: 'diagram',
      }));
    }
    normalized.push(base);
  }

  return normalized;
}
