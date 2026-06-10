const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

export function normalizeForSemantics(value) {
  const input = String(value || '').toLowerCase();
  let out = '';
  let lastWasSpace = true;
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    const isAsciiLetter = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    const isMathSignal = '_^=+-/()[]{}<>|'.includes(ch);
    if (isAsciiLetter || isDigit || isMathSignal) {
      out += ch;
      lastWasSpace = false;
    } else if (!lastWasSpace) {
      out += ' ';
      lastWasSpace = true;
    }
  }
  return out.trim();
}

export function semanticTokens(value) {
  const normalized = normalizeForSemantics(value);
  const tokens = [];
  let current = '';
  for (const ch of normalized) {
    if (ch === ' ') {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens.filter((token) => token.length > 1 || DIGITS.includes(token) || token.includes('='));
}

export function tokenF1(a, b) {
  const aTokens = semanticTokens(a);
  const bTokens = semanticTokens(b);
  if (!aTokens.length && !bTokens.length) return 1;
  if (!aTokens.length || !bTokens.length) return 0;

  const remaining = new Map();
  for (const token of bTokens) remaining.set(token, (remaining.get(token) || 0) + 1);
  let matches = 0;
  for (const token of aTokens) {
    const count = remaining.get(token) || 0;
    if (count > 0) {
      matches += 1;
      remaining.set(token, count - 1);
    }
  }
  const precision = matches / aTokens.length;
  const recall = matches / bTokens.length;
  return precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
}

export function charLcsSimilarity(a, b) {
  const left = normalizeForSemantics(a);
  const right = normalizeForSemantics(b);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  const prev = new Array(right.length + 1).fill(0);
  const curr = new Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      curr[j] = left[i - 1] === right[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    for (let j = 0; j <= right.length; j++) {
      prev[j] = curr[j];
      curr[j] = 0;
    }
  }
  return prev[right.length] / Math.max(left.length, right.length);
}

export function semanticSimilarity(a, b) {
  return (tokenF1(a, b) * 0.7) + (charLcsSimilarity(a, b) * 0.3);
}

export function equationSignatures(value) {
  const text = String(value || '');
  const signatures = [];
  let current = '';
  let inDollar = false;
  for (const ch of text) {
    if (ch === '$') {
      if (inDollar && current.trim()) signatures.push(normalizeForSemantics(current));
      current = '';
      inDollar = !inDollar;
      continue;
    }
    if (inDollar) current += ch;
  }

  const tokens = semanticTokens(text);
  for (const token of tokens) {
    if (token.includes('=') || token.includes('^') || token.includes('_') || token.includes('\\frac') || token.includes('\\int')) {
      signatures.push(token);
    }
  }
  return [...new Set(signatures.filter(Boolean))];
}

export function tableSignature(table) {
  const rows = table?.rows || [];
  return rows
    .map((row) => row.map((cell) => normalizeForSemantics(cell?.text || cell || '')).join('|'))
    .join('\n');
}

export function compactPreview(value, max = 360) {
  const text = String(value || '').replaceAll('\r', '').replaceAll('\n', ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function inferSourceTypeFromText(text, optionCount) {
  const lower = normalizeForSemantics(text);
  if (lower.includes('assertion') && lower.includes('reason')) return 'ASSERTION_REASON';
  if (lower.includes('matrix match')) return 'MATRIX_MATCH';
  if (lower.includes('match') && (lower.includes('column') || lower.includes('list'))) return 'MATCH_COLUMNS';
  if (lower.includes('comprehension') || lower.includes('passage')) return 'COMPREHENSION';
  if (lower.includes('one or more') || lower.includes('multiple correct')) return 'MCQ_MULTI';
  if (optionCount >= 2) return 'MCQ_SINGLE';
  if (lower.includes('integer')) return 'INTEGER';
  if (lower.includes('numerical') || lower.includes('____')) return 'NUMERICAL';
  return 'DESCRIPTIVE';
}

export function letterIndex(ch) {
  return LETTERS.indexOf(String(ch || '').toLowerCase());
}
