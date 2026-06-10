import fs from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';
import { createRequire } from 'module';
import { ocrService } from '../../ocr/index.js';
import { inferSourceTypeFromText } from './textSemantics.js';

const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
const pdfParse = typeof pdfParseModule === 'function'
  ? pdfParseModule
  : pdfParseModule.default || pdfParseModule.PDFParse || pdfParseModule;

export async function readOriginalSource(filePath, kind) {
  if (kind === 'docx') {
    const buffer = await fs.readFile(filePath);
    const [raw, html] = await Promise.all([
      mammoth.extractRawText({ buffer }),
      mammoth.convertToHtml({ buffer }),
    ]);
    return {
      file: path.basename(filePath),
      kind,
      text: raw.value || '',
      html: html.value || '',
      extractionMethod: 'mammoth_raw_text_and_html',
    };
  }
  if (kind === 'pdf') {
    const buffer = await fs.readFile(filePath);
    const parsed = typeof pdfParse === 'function' && !isClassExport(pdfParse)
      ? await pdfParse(buffer)
      : await parsePdfWithClass(pdfParse, buffer);
    return {
      file: path.basename(filePath),
      kind,
      text: parsed.text || '',
      pageCount: parsed.numpages || null,
      extractionMethod: 'pdf_parse_embedded_text',
    };
  }
  if (kind === 'image') {
    const ocr = await ocrService.recognizeFile(filePath);
    return {
      file: path.basename(filePath),
      kind,
      text: ocr.rawText || ocr.text || '',
      ocrConfidence: ocr.confidence,
      extractionMethod: 'tesseract_source_observation',
    };
  }
  throw new Error(`Unsupported source kind: ${kind}`);
}

function isClassExport(fn) {
  return String(fn).startsWith('class');
}

async function parsePdfWithClass(PDFParse, buffer) {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy?.();
  return {
    text: result.text || '',
    numpages: result.total || result.pages?.length || null,
  };
}

export function buildSourceQuestions(source) {
  const lines = splitLines(source.text);
  const questions = [];
  let current = null;
  let lastSection = null;

  const flush = () => {
    if (!current) return;
    finalizeSourceQuestion(current);
    if (current.stem || current.options.length || current.rawLines.length > 1) questions.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const start = detectQuestionStart(line);
    const option = detectOptionStart(line);
    const answerRole = detectAnswerOrExplanation(line);

    if (looksLikeSection(line) && !start && !option) {
      lastSection = line;
      continue;
    }

    if (start && (current?.rawLines.length || current?.options.length)) {
      flush();
    }

    if (start && !current) {
      current = createQuestion(source.file, questions.length + 1, start.number, lastSection);
      current.boundarySignals.push(start.style);
      current.rawLines.push(line);
      current.stemLines.push(start.text || line);
      continue;
    }

    if (!current) {
      current = createQuestion(source.file, questions.length + 1, null, lastSection);
      current.boundarySignals.push('implicit');
    }

    current.rawLines.push(line);

    const inline = splitInlineOptions(line);
    if (inline && inline.options.length >= 2) {
      if (inline.stem) current.stemLines.push(inline.stem);
      current.options.push(...inline.options);
      continue;
    }

    if (option) {
      current.options.push({ label: option.label, text: option.text, sourceLine: line });
      continue;
    }

    if (answerRole === 'answer') current.answerLines.push(line);
    else if (answerRole === 'explanation') current.explanationLines.push(line);
    else current.stemLines.push(line);
  }
  flush();
  return questions;
}

function createQuestion(file, index, questionNumber, section) {
  return {
    id: `${file}::source::${index}`,
    sourceFile: file,
    index,
    questionNumber,
    section,
    rawLines: [],
    stemLines: [],
    options: [],
    answerLines: [],
    explanationLines: [],
    boundarySignals: [],
    stem: '',
    questionType: 'DESCRIPTIVE',
    hasEquation: false,
    hasImageReference: false,
    hasTableReference: false,
  };
}

function finalizeSourceQuestion(q) {
  q.stem = q.stemLines.join('\n').trim();
  q.sourceQuestion = q.rawLines.join('\n').trim();
  q.options = mergeDuplicateOptions(q.options);
  q.questionType = inferSourceTypeFromText(q.sourceQuestion, q.options.length);
  q.hasEquation = containsMathSignal(q.sourceQuestion);
  q.hasImageReference = containsAny(q.sourceQuestion, ['figure', 'diagram', 'graph', 'image below', '[figure']);
  q.hasTableReference = containsAny(q.sourceQuestion, ['table', '[table']);
}

function splitLines(text) {
  const out = [];
  let current = '';
  for (const ch of String(text || '')) {
    if (ch === '\n') {
      out.push(current);
      current = '';
    } else if (ch !== '\r') {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out;
}

function cleanLine(value) {
  let out = '';
  let lastSpace = false;
  for (const ch of String(value || '')) {
    const isSpace = ch === ' ' || ch === '\t' || ch === '\u00a0';
    if (isSpace) {
      if (!lastSpace) out += ' ';
      lastSpace = true;
    } else {
      out += ch;
      lastSpace = false;
    }
  }
  return out.trim();
}

function detectQuestionStart(line) {
  const trimmed = line.trim();
  let i = 0;
  let explicitQ = false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('question')) {
    i = 'question'.length;
    explicitQ = true;
  } else if (lower.startsWith('q')) {
    i = 1;
    explicitQ = true;
  }
  while (trimmed[i] === ' ') i++;
  if (trimmed[i] === '(') i++;
  const startDigits = i;
  while (isDigit(trimmed[i])) i++;
  if (i === startDigits) return null;
  const number = Number(trimmed.slice(startDigits, i));
  while (trimmed[i] === ' ') i++;
  const delimiter = trimmed[i];
  const hasDelimiter = delimiter === '.' || delimiter === ')' || delimiter === ':' || delimiter === '-' || delimiter === ']';
  if (!hasDelimiter && !explicitQ) return null;
  if (number < 1 || number > 500) return null;
  const text = cleanLine(trimmed.slice(hasDelimiter ? i + 1 : i));
  return { number, text, style: explicitQ ? 'explicit_question_label' : 'numbered_question_label' };
}

function detectOptionStart(line) {
  const trimmed = line.trim();
  let i = 0;
  if (trimmed[i] === '(' || trimmed[i] === '[') i++;
  while (trimmed[i] === ' ') i++;
  const label = trimmed[i];
  if (!label || !isLetter(label)) return null;
  const normalized = label.toUpperCase();
  if (normalized < 'A' || normalized > 'J') return null;
  i++;
  while (trimmed[i] === ' ') i++;
  const delimiter = trimmed[i];
  if (!(delimiter === ')' || delimiter === ']' || delimiter === '.' || delimiter === ':' || delimiter === '-')) return null;
  return { label: normalized, text: cleanLine(trimmed.slice(i + 1)) };
}

function splitInlineOptions(line) {
  const markers = [];
  for (let i = 0; i < line.length - 2; i++) {
    const marker = detectOptionMarkerAt(line, i);
    if (marker) markers.push(marker);
  }
  if (markers.length < 2) return null;

  const sequence = [];
  let expected = null;
  for (const marker of markers) {
    const code = marker.label.charCodeAt(0);
    if (expected === null || code === expected) {
      sequence.push(marker);
      expected = code + 1;
    }
  }
  if (sequence.length < 2) return null;

  const options = [];
  for (let i = 0; i < sequence.length; i++) {
    const start = sequence[i].end;
    const end = i + 1 < sequence.length ? sequence[i + 1].start : line.length;
    options.push({ label: sequence[i].label, text: cleanLine(line.slice(start, end)), sourceLine: line });
  }
  return { stem: cleanLine(line.slice(0, sequence[0].start)), options };
}

function detectOptionMarkerAt(line, index) {
  const prev = index === 0 ? ' ' : line[index - 1];
  if (!isBoundary(prev)) return null;
  let i = index;
  if (line[i] === '(' || line[i] === '[') i++;
  while (line[i] === ' ') i++;
  const label = line[i];
  if (!isLetter(label)) return null;
  const upper = label.toUpperCase();
  if (upper < 'A' || upper > 'J') return null;
  i++;
  while (line[i] === ' ') i++;
  const delimiter = line[i];
  if (!(delimiter === ')' || delimiter === ']' || delimiter === '.' || delimiter === ':' || delimiter === '-')) return null;
  return { label: upper, start: index, end: i + 1 };
}

function detectAnswerOrExplanation(line) {
  const lower = line.toLowerCase();
  for (const label of ['answer', 'ans', 'correct option', 'key']) {
    if (lower.startsWith(label)) return 'answer';
  }
  for (const label of ['solution', 'explanation', 'detailed solution', 'soln', 'reason']) {
    if (lower.startsWith(label)) return 'explanation';
  }
  return null;
}

function looksLikeSection(line) {
  if (line.length > 90) return false;
  const lower = line.toLowerCase();
  return containsAny(lower, ['jee main', 'jee advanced', 'neet', 'cbse', 'mcqs', 'numeric value', 'part a', 'multiple choice']);
}

function mergeDuplicateOptions(options) {
  const seen = new Set();
  const out = [];
  for (const option of options) {
    const key = `${option.label}:${option.text}`;
    if (!seen.has(key)) {
      out.push(option);
      seen.add(key);
    }
  }
  return out;
}

function containsMathSignal(text) {
  return containsAny(text, ['$', '\\frac', '\\int', '^', '_', '√', '∫', '∑', '=']);
}

function containsAny(value, needles) {
  const lower = String(value || '').toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function isLetter(ch) {
  const lower = String(ch || '').toLowerCase();
  return lower >= 'a' && lower <= 'z';
}

function isBoundary(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === ':' || ch === ';';
}
