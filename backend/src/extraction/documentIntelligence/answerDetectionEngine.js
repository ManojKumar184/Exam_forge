const EXPLICIT_ANSWER_RE = /(?:answer|ans|correct\s+option|key)\s*[:\-]?\s*\(?\s*([A-Ha-h](?:\s*[,/&]\s*[A-Ha-h])*)\s*\)?/i;
const CHECK_RE = /[✓✔]/;

export function detectAnswer(segment, options = []) {
  const answerText = (segment.answerBlocks?.map((block) => block.text).join('\n') || '')
    .split(/(?:solution|explanation|detailed\s+solution|soln|reason)\s*[:\-]?/i)[0];
  const labelledValue = answerText.match(/(?:answer|ans|correct\s+answer|correct\s+option|key)\s*[:\-]\s*(.+)/i)?.[1]?.trim();
  if (labelledValue) {
    const optionLabels = labelledValue.match(/^[A-H](?:\s*[,/&]\s*[A-H])*$/i);
    if (optionLabels) return buildAnswer(labelledValue, 1, 'explicit_label', 0.96, options);
    const boolean = labelledValue.match(/^(true|false|t|f)$/i)?.[1]?.toUpperCase();
    const number = parseNumericalAnswer(labelledValue);
    const value = boolean || labelledValue;
    return {
      answerText: value,
      answerKey: value,
      correctOption: boolean ? (boolean === 'TRUE' || boolean === 'T' ? 0 : 1) : null,
      correctAnswers: /^[A-H]$/i.test(value) ? [value.toUpperCase()] : [value],
      numericalAnswer: number !== null ? number : undefined,
      confidence: 0.94,
      level: 1,
      method: 'explicit_label',
      warnings: [],
    };
  }
  const explicit = answerText.match(EXPLICIT_ANSWER_RE);
  if (explicit) {
    return buildAnswer(explicit[1], 1, 'explicit_label', 0.96, options);
  }

  const tableBlocks = [...(segment.stemBlocks || []), ...(segment.optionBlocks || [])].filter((block) => block.table);
  for (const block of tableBlocks) {
    const cells = block.table?.rows?.flatMap((row) => row.flatMap((cell) => cell?.text ? [cell.text] : [])) || [];
    const joined = cells.join(' ');
    const match = joined.match(EXPLICIT_ANSWER_RE);
    if (match) return buildAnswer(match[1], 3, 'structured_answer_table', 0.82, options);
  }

  for (const [index, block] of (segment.optionBlocks || []).entries()) {
    if (CHECK_RE.test(block.text || '') || block.raw?.isBoldCorrect) {
      return buildAnswer(block.raw?.label || String.fromCharCode(65 + index), 4, 'option_annotation', 0.74, options);
    }
  }

  return {
    answerText: null,
    answerKey: null,
    correctOption: null,
    correctAnswers: [],
    confidence: 0.25,
    level: 5,
    method: 'semantic_inference_not_available',
    warnings: ['Answer not detected with high confidence'],
  };
}

export function extractSeparateAnswerKey(blocks = []) {
  const start = blocks.findIndex((block) => /^\s*(?:separate\s+)?(?:answer\s+key|answers?)\s*[:\-]?\s*$/i.test(block.text || ''));
  if (start < 0) return { found: false, entries: [], issues: [], sourceBlockIndexes: [] };
  const entries = [];
  const issues = [];
  const sourceBlockIndexes = [start];
  const lineRe = /^\s*(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[).:\-]?\s*(?:[:\-]\s*)?(?:answer\s*[:\-]?\s*)?(.+?)\s*$/i;
  for (let i = start + 1; i < blocks.length; i += 1) {
    const text = String(blocks[i].text || '').trim();
    if (!text) continue;
    const line = lineRe.exec(text);
    if (!line) {
      if (/^(?:section|part)\b/i.test(text)) break;
      issues.push({ type: 'unparsed_answer_key_line', line: text });
      sourceBlockIndexes.push(i);
      continue;
    }
    const questionNumber = Number(line[1]);
    const answer = line[2].split(/\s*[,/&]\s*/).map((part) => part.trim()).filter(Boolean);
    const duplicate = entries.some((entry) => entry.questionNumber === questionNumber);
    if (duplicate) issues.push({ type: 'duplicate_answer', questionNumber });
    entries.push({ questionNumber, answer, confidence: duplicate ? 0.5 : 0.99, method: 'separate_answer_key' });
    sourceBlockIndexes.push(i);
  }
  return { found: true, entries, issues, sourceBlockIndexes };
}

export function mapSeparateAnswerKey(answerKey, segments = []) {
  if (!answerKey?.found) return { mapped: new Map(), issues: [] };
  const byNumber = new Map(segments.filter((segment) => segment.questionNumber).map((segment) => [segment.questionNumber, segment]));
  const mapped = new Map();
  const issues = [...(answerKey.issues || [])];
  for (const entry of answerKey.entries || []) {
    const segment = byNumber.get(entry.questionNumber);
    if (!segment) {
      issues.push({ type: 'unknown_question_number', questionNumber: entry.questionNumber });
      continue;
    }
    if (mapped.has(entry.questionNumber)) continue;
    const optionLabels = new Set((segment.optionBlocks || []).map((block, index) => {
      const label = block.raw?.label || block.text?.match(/^\s*([A-H])\s*[).:\-]/i)?.[1] || String.fromCharCode(65 + index);
      return String(label).toUpperCase();
    }));
    const labels = entry.answer.map((answer) => answer.toUpperCase());
    const isBoolean = labels.length > 0 && labels.every((label) => ['TRUE', 'FALSE', 'T', 'F'].includes(label));
    const invalid = (segment.optionBlocks || []).length > 0 && !isBoolean && labels.some((label) => !optionLabels.has(label));
    if (invalid) issues.push({ type: 'invalid_option_label', questionNumber: entry.questionNumber, labels: labels.filter((label) => !optionLabels.has(label)) });
    const result = { ...entry, answer: labels, confidence: invalid ? 0.55 : entry.confidence, valid: !invalid };
    mapped.set(entry.questionNumber, result);
    segment.answerBlocks = [...(segment.answerBlocks || []), { text: `Answer: ${labels.join(',')}`, roleHints: ['answer'] }];
    segment.answerMapping = result;
  }
  for (const segment of segments) {
    if (segment.questionNumber && !mapped.has(segment.questionNumber)) issues.push({ type: 'missing_answer', questionNumber: segment.questionNumber });
  }
  for (const issue of issues) {
    const target = issue.questionNumber && byNumber.get(issue.questionNumber);
    if (target) target.answerMappingIssues = [...(target.answerMappingIssues || []), issue];
  }
  return { mapped, issues };
}

function buildAnswer(raw, level, method, confidence, options) {
  const labels = String(raw)
    .split(/[,/&\s]+/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  const correctOption = labels.length === 1 ? labels[0].charCodeAt(0) - 65 : null;
  const validLabels = new Set(options.map((_, index) => String.fromCharCode(65 + index)));
  const unmatched = labels.filter((label) => !validLabels.has(label));
  return {
    answerText: labels.join(','),
    answerKey: labels.join(','),
    correctOption,
    correctAnswers: labels,
    confidence: unmatched.length ? Math.min(confidence, 0.58) : confidence,
    level,
    method,
    warnings: unmatched.length ? [`Answer label does not match available options: ${unmatched.join(', ')}`] : [],
  };
}
import { parseNumericalAnswer } from '../../utils/numericalAnswer.js';
