/**
 * Client-side column-order + block split (mirrors backend heuristics for offline fallback).
 */

const QUESTION_START_RE =
  /^(?:Q(?:uestion)?\s*)?(\d{1,3})[\).:\-\s]+|^\((\d{1,3})\)\s+|^(\d{1,3})\.\s+(?=[A-Za-z(\\$])/i;

const OPTION_LINE =
  /^\s*(?:\(?\s*([a-dA-D])\s*\)?\s*[\).:\-–—]\s*)(.+)$/;

function splitLineByGaps(line: string): string[] {
  const trimmed = line.trimEnd();
  if (!trimmed) return [];
  const parts = trimmed.split(/\t+|\s{3,}/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [trimmed.trim()];
}

export function preprocessDocumentText(raw: string): string {
  const segments = raw.replace(/\r\n/g, '\n').split(/\f|\n---\s*Page\s+\d+\s*---\n?/i);
  return segments.map(reconstructSegment).join('\n\n').trim();
}

function reconstructSegment(segmentText: string): string {
  const lines = segmentText.replace(/\r\n/g, '\n').split('\n');
  const nonempty = lines.filter((l) => l.trim().length > 8);
  if (nonempty.length < 4) return segmentText.replace(/\r\n/g, '\n').trim();

  const counts = { c1: 0, c2: 0, c3: 0 };
  for (const line of nonempty) {
    const parts = splitLineByGaps(line);
    if (parts.length >= 3) counts.c3 += 1;
    else if (parts.length === 2) counts.c2 += 1;
    else counts.c1 += 1;
  }
  const total = nonempty.length;
  let colCount = 1;
  if (counts.c3 / total > 0.12) colCount = 3;
  else if (counts.c2 / total > 0.18) colCount = 2;
  if (colCount <= 1) return segmentText.replace(/\r\n/g, '\n').trim();

  const columns: string[][] = Array.from({ length: colCount }, () => []);
  for (const line of lines) {
    if (!line.trim()) {
      columns.forEach((c) => c.push(''));
      continue;
    }
    const parts = splitLineByGaps(line);
    for (let i = 0; i < colCount; i += 1) {
      columns[i].push(parts[i] || '');
    }
  }
  return columns.map((c) => c.join('\n')).join('\n\n');
}

export interface ParsedBlock {
  lines: string[];
  options: { text: string }[];
  passage?: string;
}

export function splitTextIntoBlocks(rawText: string): ParsedBlock[] {
  const ordered = preprocessDocumentText(rawText);
  const lines = ordered.split('\n').map((l) => l.trimEnd());
  const blocks: ParsedBlock[] = [];
  let current: ParsedBlock = { lines: [], options: [] };
  let passageLines: string[] = [];
  let inPassage = false;

  const flush = () => {
    if (current.lines.length || current.options.length) {
      const b: ParsedBlock = { ...current };
      if (passageLines.length && inPassage) b.passage = passageLines.join('\n').trim();
      blocks.push(b);
    }
    current = { lines: [], options: [] };
    passageLines = [];
    inPassage = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/comprehension|passage/i.test(trimmed) && trimmed.length < 80) {
      flush();
      inPassage = true;
      continue;
    }

    const opt = trimmed.match(OPTION_LINE);
    if (opt) {
      inPassage = false;
      current.options.push({ text: opt[2].trim() });
      continue;
    }

    if (inPassage && !QUESTION_START_RE.test(trimmed) && !current.lines.length && !current.options.length) {
      passageLines.push(trimmed);
      continue;
    }

    if (QUESTION_START_RE.test(trimmed) && (current.lines.length || current.options.length)) {
      flush();
      current.lines.push(trimmed.replace(QUESTION_START_RE, '').trim());
      inPassage = false;
      continue;
    }

    if (current.options.length && !QUESTION_START_RE.test(trimmed) && !OPTION_LINE.test(trimmed)) {
      const last = current.options[current.options.length - 1];
      last.text = `${last.text} ${trimmed}`.trim();
      continue;
    }

    current.lines.push(trimmed);
  }

  if (current.lines.length || current.options.length) flush();
  return blocks;
}
