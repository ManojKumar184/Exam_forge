import { detectQuestionType } from './detectQuestionType.js';
import { computeDuplicateHash } from '../utils/duplicateHash.js';
import { enrichTextWithLatexFields, enrichOptionWithLatex } from './latexUtils.js';
import { preprocessDocumentText } from './columnReadingOrder.js';
import { detectSectionHeader } from './sectionParser.js';
import { isOptionLine, parseOptionLine, extractInlineOptions } from './optionParser.js';

const QUESTION_START_RE =
  /^(?:Q(?:uestion)?\s*)?(\d{1,3})[\).:\-\s]+|^\((\d{1,3})\)\s+|^(\d{1,3})\.\s+(?=[A-Za-z(\\$])/i;

function stripQuestionPrefix(line) {
  return line
    .replace(/^(?:Q(?:uestion)?\s*)?\d{1,3}[\).:\-\s]+/i, '')
    .replace(/^\(\d{1,3}\)\s+/, '')
    .trim();
}

function isQuestionStart(line) {
  return QUESTION_START_RE.test(line.trim());
}

function extractQuestionNumber(line) {
  const m = line.trim().match(QUESTION_START_RE);
  if (!m) return null;
  return Number(m[1] || m[2] || m[3]) || null;
}

export function splitTextIntoBlocks(rawText) {
  if (!rawText?.trim()) return [];

  const ordered = preprocessDocumentText(rawText);
  const lines = ordered
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd());

  const blocks = [];
  let current = { lines: [], options: [], questionNumber: null, section: 'General' };

  const flush = () => {
    if (current.lines.length > 0 || current.options.length > 0) {
      blocks.push({ ...current });
    }
    current = { lines: [], options: [], questionNumber: null, section: current.section };
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    const sectionHeader = detectSectionHeader(trimmed);
    if (sectionHeader) {
      flush();
      current.section = sectionHeader.name;
      continue;
    }

    if (isOptionLine(trimmed)) {
      const opt = parseOptionLine(trimmed);
      if (opt) {
        current.options.push({ text: opt.text, image: null, latex: null });
        continue;
      }
    }

    if (isQuestionStart(trimmed) && (current.lines.length > 0 || current.options.length > 0)) {
      flush();
      current.questionNumber = extractQuestionNumber(trimmed);
      current.lines.push(stripQuestionPrefix(trimmed));
      continue;
    }

    if (current.options.length > 0 && !isQuestionStart(trimmed) && !isOptionLine(trimmed)) {
      const last = current.options[current.options.length - 1];
      if (last && trimmed.length < 200 && !/^(?:Q|Question)\s*\d/i.test(trimmed)) {
        last.text = `${last.text} ${trimmed}`.trim();
        continue;
      }
    }

    if (isQuestionStart(trimmed)) {
      current.questionNumber = extractQuestionNumber(trimmed);
      current.lines.push(stripQuestionPrefix(trimmed));
    } else {
      current.lines.push(trimmed);
    }
  }

  if (current.lines.length > 0 || current.options.length > 0) blocks.push(current);
  return blocks;
}

export function normalizeQuestions(rawBlocks, context = {}) {
  const normalized = [];

  for (const block of rawBlocks) {
    let questionText = block.lines.join('\n').trim();
    if (!questionText || questionText.length < 5) continue;

    const inline = extractInlineOptions(questionText);
    if (inline.options.length >= 2) {
      questionText = inline.stem;
      block.options = [...(block.options || []), ...inline.options];
    }

    const typeResult = detectQuestionType(block);
    const questionType = typeResult.questionType;
    const tags = [
      ...new Set([...(typeResult.tags || []), ...(block.section ? [`section:${block.section}`] : [])]),
    ];
    if (block.questionNumber) tags.push(`qnum:${block.questionNumber}`);
    if (typeResult.subtype) tags.push(typeResult.subtype);

    const warnings = [];

    if (questionText.length < 15) warnings.push('Short question text — verify extraction');
    if (questionType === 'mcq' && block.options.length < 2) {
      warnings.push('MCQ detected but fewer than 2 options found — check column order');
    }
    if (typeResult.subtype === 'mcq_incomplete') {
      warnings.push('Partial option markers found — verify MCQ options');
    }

    let correctOption = null;
    let answerText = block.answerKey || null;

    const answerMatch = questionText.match(
      /(?:answer|ans|correct)\s*[:\-]?\s*\(?([a-dA-D])\)?/i
    );
    if (answerMatch) {
      correctOption = answerMatch[1].toUpperCase().charCodeAt(0) - 65;
      answerText = answerMatch[1].toUpperCase();
    }

    const status =
      warnings.length > 0 || typeResult.subtype === 'mcq_incomplete' ? 'needs_review' : 'pending';

    const base = {
      questionText,
      questionType,
      questionLatex: block.questionLatex || null,
      options: block.options.length ? block.options.map(enrichOptionWithLatex) : [],
      correctOption,
      answerText,
      answerKey: answerText,
      class: context.class || 11,
      difficulty: context.difficulty || 'medium',
      marks: context.marks || 4,
      status,
      tags,
      extractionWarnings: warnings,
      duplicateHash: computeDuplicateHash(questionText),
      questionImages: block.images || [],
      diagrams: block.diagrams || [],
      hasDiagram: Boolean(block.images?.length || block.diagrams?.length),
      hasTable: Boolean(block.hasTable),
      source: context.source || 'upload',
      sourceFile: context.sourceFile || null,
      extractedFrom: context.extractedFrom || null,
      renderingMetadata: {
        section: block.section || null,
        questionNumber: block.questionNumber || null,
        subtype: typeResult.subtype || null,
      },
    };
    enrichTextWithLatexFields(questionText, base);
    if (base.questionLatex && !base.hasEquation) base.hasEquation = true;
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

export { preprocessDocumentText } from './columnReadingOrder.js';
