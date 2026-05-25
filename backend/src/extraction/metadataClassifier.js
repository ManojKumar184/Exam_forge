import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { ExamType } from '../models/ExamType.js';

const CLASS_PATTERNS = [
  /\bclass\s*[-:]?\s*(\d{1,2})\b/i,
  /\bstd\.?\s*(\d{1,2})\b/i,
  /\bgrade\s*(\d{1,2})\b/i,
  /\b(xii|xi|x|ix|viii|vii|vi)\b/i,
];

const EXAM_HINTS = [
  { pattern: /\b(jee\s*main|jee\s*advanced|iit\s*jee)\b/i, code: 'JEE' },
  { pattern: /\b(neet|aipmt)\b/i, code: 'NEET' },
  { pattern: /\b(cbse|ncert)\b/i, code: 'CBSE' },
  { pattern: /\b(board|final\s*exam)\b/i, code: 'BOARD' },
];

const DIFFICULTY_HINTS = {
  easy: /\b(easy|basic|simple|introductory)\b/i,
  hard: /\b(hard|difficult|advanced|challenging|complex)\b/i,
};

const ROMAN_CLASS = { xii: 12, xi: 11, x: 10, ix: 9, viii: 8, vii: 7, vi: 6 };

function normalizeText(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function detectClassFromText(text, fallback = 11) {
  for (const re of CLASS_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const token = m[1].toLowerCase();
    if (ROMAN_CLASS[token]) return ROMAN_CLASS[token];
    const n = Number(token);
    if (n >= 6 && n <= 12) return n;
  }
  return fallback;
}

function detectClassesInDocument(headerText) {
  const found = new Set();
  for (const re of CLASS_PATTERNS) {
    let m;
    const g = new RegExp(re.source, re.flags);
    while ((m = g.exec(headerText)) !== null) {
      const token = (m[1] || '').toLowerCase();
      if (ROMAN_CLASS[token]) found.add(ROMAN_CLASS[token]);
      else {
        const n = Number(m[1]);
        if (n >= 6 && n <= 12) found.add(n);
      }
    }
  }
  return [...found];
}

function matchCatalogByName(name, items, key = 'name') {
  const n = normalizeText(name);
  if (!n) return null;
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    const label = normalizeText(item[key]);
    if (!label) continue;
    if (n === label || n.includes(label) || label.includes(n)) {
      const score = Math.min(n.length, label.length);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
  }
  return best;
}

function detectSubjectFromText(text, subjects) {
  const t = normalizeText(text);
  for (const s of subjects) {
    const name = normalizeText(s.name);
    const code = normalizeText(s.code);
    if ((name && t.includes(name)) || (code && code.length > 2 && t.includes(code))) {
      return s;
    }
  }
  return matchCatalogByName(text.slice(0, 200), subjects);
}

function detectExamTypeFromText(text, examTypes) {
  for (const hint of EXAM_HINTS) {
    if (hint.pattern.test(text)) {
      const match = examTypes.find((e) => normalizeText(e.code).includes(normalizeText(hint.code)));
      if (match) return match;
    }
  }
  return matchCatalogByName(text.slice(0, 300), examTypes, 'name');
}

function detectTopicFromText(text, topics, subjectId, classLevel) {
  const scoped = topics.filter(
    (t) =>
      (!subjectId || t.subjectId?.toString() === subjectId?.toString()) &&
      (!classLevel || t.class === classLevel)
  );
  const chapterMatch = text.match(/\b(?:chapter|unit|topic)\s*[-.:]?\s*([^\n,.]{3,60})/i);
  if (chapterMatch) {
    const hit = matchCatalogByName(chapterMatch[1], scoped);
    if (hit) return hit;
  }
  return matchCatalogByName(text.slice(0, 120), scoped);
}

export function estimateDifficulty(question, context = {}) {
  if (context.difficulty) return context.difficulty;

  const text = `${question.questionText || ''} ${(question.options || []).map((o) => o.text).join(' ')}`;
  const len = text.length;
  const marks = Number(question.marks || context.marks || 4);

  if (DIFFICULTY_HINTS.easy.test(text)) return 'easy';
  if (DIFFICULTY_HINTS.hard.test(text)) return 'hard';
  if (marks >= 8 || len > 450) return 'hard';
  if (marks <= 2 || len < 120) return 'easy';
  return 'medium';
}

/**
 * Parse document header (first ~3k chars) for mixed-paper signals.
 */
export function parseDocumentMetadata(rawText, catalog = {}, uploadContext = {}) {
  const header = (rawText || '').slice(0, 3500);
  const classesFound = detectClassesInDocument(header);
  const defaultClass = uploadContext.class
    ? Number(uploadContext.class)
    : classesFound[0] || detectClassFromText(header, 11);

  const subject =
    uploadContext.subjectId
      ? catalog.subjects?.find((s) => s._id.toString() === uploadContext.subjectId)
      : detectSubjectFromText(`${header} ${uploadContext.filename || ''}`, catalog.subjects || []);

  const examType =
    uploadContext.examTypeId
      ? catalog.examTypes?.find((e) => e._id.toString() === uploadContext.examTypeId)
      : detectExamTypeFromText(header, catalog.examTypes || []);

  const isMixed = classesFound.length > 1;
  const warnings = [];
  if (isMixed) warnings.push(`Multiple classes detected (${classesFound.join(', ')}) — verify per question`);
  if (!subject) warnings.push('Subject could not be detected — set before approval');
  if (!examType) warnings.push('Exam type could not be detected — set before approval');

  return {
    defaultClass,
    classesFound,
    isMixed,
    subjectId: subject?._id || null,
    examTypeId: examType?._id || null,
    warnings,
    confidence: {
      class: classesFound.length === 1 ? 0.85 : isMixed ? 0.4 : 0.6,
      subject: subject ? 0.8 : 0.2,
      examType: examType ? 0.75 : 0.2,
    },
  };
}

/**
 * Classify a single extracted question with catalog + document context.
 */
export function classifyExtractedQuestion(question, catalog, docMeta = {}, uploadContext = {}) {
  const text = question.questionText || '';
  const blockClass = detectClassFromText(text, docMeta.defaultClass || 11);
  const classLevel = docMeta.isMixed ? blockClass : docMeta.defaultClass || blockClass;

  const subjectId =
    uploadContext.subjectId ||
    docMeta.subjectId ||
    detectSubjectFromText(text, catalog.subjects || [])?._id ||
    null;

  const examTypeId =
    uploadContext.examTypeId ||
    docMeta.examTypeId ||
    detectExamTypeFromText(text, catalog.examTypes || [])?._id ||
    null;

  const topic = detectTopicFromText(text, catalog.topics || [], subjectId, classLevel);
  const difficulty = estimateDifficulty(question, uploadContext);
  const tags = [...(question.tags || [])];

  if (docMeta.isMixed) tags.push('mixed_paper');
  if (question.hasEquation) tags.push('equation');
  if (question.hasDiagram) tags.push('diagram');

  const warnings = [...(question.extractionWarnings || [])];
  let status = question.status || 'pending';
  let aiConfidence = 0;

  const scores = [];
  if (classLevel >= 6 && classLevel <= 12) scores.push(0.7);
  else warnings.push('Invalid class detected');
  if (subjectId) scores.push(0.75);
  else warnings.push('Subject not classified');
  if (examTypeId) scores.push(0.7);
  if (topic) scores.push(0.65);
  else warnings.push('Topic/chapter not matched');

  aiConfidence = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.3;

  if (!subjectId || !examTypeId || aiConfidence < 0.55 || docMeta.isMixed) {
    status = 'needs_review';
  }

  return {
    class: classLevel,
    subjectId,
    chapterId: topic?._id || null,
    examTypeId,
    difficulty,
    tags: [...new Set(tags)],
    status,
    aiConfidence: Math.round(aiConfidence * 100),
    aiMetadata: {
      provider: 'rules',
      status: 'CLASSIFIED',
      document: {
        isMixed: docMeta.isMixed,
        classesFound: docMeta.classesFound,
      },
      confidence: docMeta.confidence,
      matched: {
        subject: subjectId,
        chapter: topic?._id?.toString(),
        examType: examTypeId,
      },
    },
    extractionWarnings: warnings,
  };
}

export async function loadClassificationCatalog() {
  const [subjects, topics, examTypes] = await Promise.all([
    Subject.find({}).lean(),
    Topic.find({}).lean(),
    ExamType.find({ isActive: { $ne: false } }).lean(),
  ]);
  return { subjects, topics, examTypes };
}
