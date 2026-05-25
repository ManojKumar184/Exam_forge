/**
 * MCQ option extraction — avoids P(A), P(B) false positives; dedupes labels.
 */

/** (A) not preceded by letter/digit (so P(A) is ignored). */
const INLINE_MCQ_MARKER = /(?<![A-Za-z0-9])(\(\s*([A-D])\s*\))/gi;

const OPTION_LINE_START =
  /^\s*(?:\(?\s*([a-dA-D])\s*\)?\s*[\).:\-–—]\s*|([a-dA-D])\s*[\).:\-–—]\s+)(.+)$/;

const LABEL_ORDER = ['a', 'b', 'c', 'd'];

function isValidMcqMarkerSequence(markers) {
  if (markers.length < 2) return false;
  const labels = markers.map((m) => m.label);
  const unique = new Set(labels);
  if (unique.size < 2) return false;
  const indices = labels.map((l) => LABEL_ORDER.indexOf(l)).filter((i) => i >= 0);
  if (indices.length < 2) return false;
  return true;
}

function dedupeByLabel(options) {
  const map = new Map();
  for (const o of options) {
    const label = (o.label || '').toLowerCase();
    if (!label) continue;
    const prev = map.get(label);
    if (!prev || (o.text || '').length > (prev.text || '').length) {
      map.set(label, o);
    }
  }
  return LABEL_ORDER.map((l) => map.get(l)).filter(Boolean);
}

function wrapOptionFractions(text) {
  if (!text) return text;
  return text.replace(/(?<![\d$\\])(\d+)\s*\/\s*(\d+)(?!\d)/g, (_, a, b) => `$\\frac{${a}}{${b}}$`);
}

/**
 * Extract inline (A)...(B)...(C)...(D) options from one block of text.
 */
export function extractMcqOptionsInline(text) {
  if (!text) return { stem: text, options: [] };

  const markers = [];
  let m;
  const re = new RegExp(INLINE_MCQ_MARKER.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    markers.push({ index: m.index, label: m[2].toLowerCase(), len: m[0].length });
  }

  if (isValidMcqMarkerSequence(markers)) {
    const options = [];
    for (let i = 0; i < markers.length; i += 1) {
      const start = markers[i].index + markers[i].len;
      const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
      let chunk = text.slice(start, end).replace(/^[\s).:\-–—]+/, '').trim();
      chunk = wrapOptionFractions(chunk);
      if (chunk) {
        options.push({
          label: markers[i].label,
          text: chunk,
          image: null,
          latex: null,
        });
      }
    }
    const stem = text.slice(0, markers[0].index).trim();
    return { stem, options: dedupeByLabel(options) };
  }

  const lineOpts = [];
  const stemLines = [];
  for (const line of text.split('\n')) {
    const parsed = line.trim().match(OPTION_LINE_START);
    if (parsed) {
      const label = (parsed[1] || parsed[2] || '').toLowerCase();
      lineOpts.push({
        label,
        text: wrapOptionFractions(parsed[3].trim()),
        image: null,
        latex: null,
      });
    } else if (lineOpts.length && line.trim() && !/^(?:Q|Question)\s*\d/i.test(line)) {
      const last = lineOpts[lineOpts.length - 1];
      last.text = `${last.text} ${line.trim()}`.trim();
    } else {
      stemLines.push(line);
    }
  }

  if (lineOpts.length >= 2) {
    return {
      stem: stemLines.join('\n').trim(),
      options: dedupeByLabel(lineOpts),
    };
  }

  return { stem: text, options: [] };
}

export function countMcqOptionMarkers(text) {
  if (!text) return 0;
  const labels = new Set();
  const re = new RegExp(INLINE_MCQ_MARKER.source, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) labels.add(m[2].toLowerCase());
  return labels.size;
}

export function hasMcqOptionPattern(text) {
  return countMcqOptionMarkers(text) >= 2;
}
