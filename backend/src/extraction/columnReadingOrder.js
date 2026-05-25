/**
 * Multi-column layout reconstruction (JEE/NEET coaching papers).
 * Reading order: column 1 top→bottom, then column 2, then column 3 (newspaper style).
 */

const PAGE_BREAK_RE = /(?:\f|\n---\s*Page\s+\d+\s*---\n?)/i;

function splitLineByGaps(line) {
  const trimmed = line.trimEnd();
  if (!trimmed) return [];
  const parts = trimmed.split(/\t+|\s{3,}/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [trimmed.trim()];
}

function estimateColumnCount(lines) {
  const nonempty = lines.filter((l) => l.trim().length > 8);
  if (nonempty.length < 4) return 1;

  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const line of nonempty) {
    const parts = splitLineByGaps(line);
    if (parts.length >= 3) counts[3] += 1;
    else if (parts.length === 2) counts[2] += 1;
    else counts[1] += 1;
  }

  const total = nonempty.length;
  if (counts[3] / total > 0.12) return 3;
  if (counts[2] / total > 0.18) return 2;
  return 1;
}

/**
 * Reconstruct single-page/segment text from detected columns.
 */
export function reconstructSegmentReadingOrder(segmentText) {
  const lines = segmentText.replace(/\r\n/g, '\n').split('\n');
  const colCount = estimateColumnCount(lines);
  if (colCount <= 1) return segmentText.replace(/\r\n/g, '\n').trim();

  const columns = Array.from({ length: colCount }, () => []);

  for (const line of lines) {
    if (!line.trim()) {
      for (const col of columns) col.push('');
      continue;
    }
    const parts = splitLineByGaps(line);
    if (parts.length >= colCount) {
      for (let i = 0; i < colCount; i += 1) {
        columns[i].push(parts[i] || '');
      }
    } else if (parts.length === 2 && colCount === 2) {
      columns[0].push(parts[0]);
      columns[1].push(parts[1]);
    } else if (parts.length === 1) {
      const target = columns.findIndex((c) => c.length > 0 && c[c.length - 1] !== '');
      const idx = target >= 0 ? target : 0;
      const last = columns[idx][columns[idx].length - 1];
      if (last && last.length > 0 && !/^\d{1,3}[\).]/.test(parts[0])) {
        columns[idx][columns[idx].length - 1] = `${last} ${parts[0]}`;
      } else {
        columns[idx].push(parts[0]);
      }
    } else {
      columns[0].push(line.trim());
    }
  }

  return columns
    .map((col) => col.filter((l) => l !== undefined).join('\n').trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Preprocess full document text: per-page column reordering.
 */
export function preprocessDocumentText(rawText) {
  if (!rawText?.trim()) return '';
  const segments = rawText.split(PAGE_BREAK_RE).map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 1) {
    return reconstructSegmentReadingOrder(rawText);
  }
  return segments.map((seg) => reconstructSegmentReadingOrder(seg)).join('\n\n--- Page break ---\n\n');
}

function clusterWordsIntoLines(words, yTolerance = 12) {
  const sorted = [...words].filter((w) => w.text?.trim()).sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const lines = [];
  for (const w of sorted) {
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    let row = lines.find((l) => Math.abs(l.y - cy) <= yTolerance);
    if (!row) {
      row = { y: cy, words: [], minX: Infinity, maxX: 0 };
      lines.push(row);
    }
    row.words.push(w);
    row.minX = Math.min(row.minX, w.bbox.x0);
    row.maxX = Math.max(row.maxX, w.bbox.x1);
  }
  return lines
    .sort((a, b) => a.y - b.y)
    .map((row) => ({
      text: row.words
        .sort((a, b) => a.bbox.x0 - b.bbox.x0)
        .map((w) => w.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
      minX: row.minX,
      maxX: row.maxX,
      centerX: (row.minX + row.maxX) / 2,
    }))
    .filter((l) => l.text.length > 0);
}

/**
 * OCR word boxes → column-ordered plain text.
 */
export function reconstructOcrReadingOrder(words) {
  if (!words?.length) return '';
  const lines = clusterWordsIntoLines(words);
  if (lines.length < 3) return lines.map((l) => l.text).join('\n');

  const pageMaxX = Math.max(...lines.map((l) => l.maxX));
  const pageMinX = Math.min(...lines.map((l) => l.minX));
  const width = pageMaxX - pageMinX || 1;

  let colCount = 2;
  const thirds = lines.filter((l) => {
    const rel = (l.centerX - pageMinX) / width;
    return rel > 0.28 && rel < 0.72;
  });
  if (thirds.length / lines.length < 0.08) {
    const left = lines.filter((l) => (l.centerX - pageMinX) / width < 0.38).length;
    const right = lines.filter((l) => (l.centerX - pageMinX) / width > 0.62).length;
    if (left / lines.length > 0.2 && right / lines.length > 0.2) colCount = 2;
    else colCount = 1;
  } else {
    colCount = 3;
  }

  if (colCount === 1) return lines.map((l) => l.text).join('\n');

  const buckets = Array.from({ length: colCount }, () => []);
  for (const line of lines) {
    const rel = (line.centerX - pageMinX) / width;
    let idx = 0;
    if (colCount === 2) idx = rel < 0.5 ? 0 : 1;
    else if (rel < 0.36) idx = 0;
    else if (rel > 0.64) idx = 2;
    else idx = 1;
    buckets[idx].push(line.text);
  }

  return buckets
    .map((b) => b.join('\n'))
    .filter(Boolean)
    .join('\n\n');
}
