/**
 * MCQ option extraction — avoids P(A), P(B) false positives; dedupes labels.
 * Protects equation regions before parsing options.
 */

const INLINE_MCQ_MARKER = /(?<![A-Za-z0-9])(?:(\(\s*([a-fA-F])\s*\))|(\b([a-fA-F])\s*[\).]))/gi;

const OPTION_LINE_START =
  /^\s*(?:\(?\s*([a-fA-F])\s*\)?\s*[\).:\-–—]\s*|([a-fA-F])\s*[\).:\-–—]\s+)(.+)$/;

const LABEL_ORDER = ['a', 'b', 'c', 'd', 'e', 'f'];

function protectMathRegions(text) {
  const placeholders = new Map();
  let count = 0;
  let protectedText = text;

  // Protect double dollar equations
  protectedText = protectedText.replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
    const key = `__MATH_PLACEHOLDER_${count++}__`;
    placeholders.set(key, match);
    return key;
  });

  // Protect single dollar equations
  protectedText = protectedText.replace(/\$([^$\n]+?)\$/g, (match) => {
    const key = `__MATH_PLACEHOLDER_${count++}__`;
    placeholders.set(key, match);
    return key;
  });

  return { text: protectedText, placeholders };
}

function restoreMathRegions(text, placeholders) {
  let restoredText = text;
  for (const [key, original] of placeholders.entries()) {
    restoredText = restoredText.split(key).join(original);
  }
  return restoredText;
}

function getValidMcqMarkers(markers) {
  const sequences = [];
  for (let i = 0; i < markers.length; i++) {
    const seq = [markers[i]];
    let lastIdx = LABEL_ORDER.indexOf(markers[i].label);
    for (let j = i + 1; j < markers.length; j++) {
      const idx = LABEL_ORDER.indexOf(markers[j].label);
      if (idx === lastIdx + 1) {
        seq.push(markers[j]);
        lastIdx = idx;
      }
    }
    sequences.push(seq);
  }
  
  let longest = [];
  for (const seq of sequences) {
    if (seq.length > longest.length) {
      longest = seq;
    }
  }
  return longest.length >= 2 ? longest : [];
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

  const { text: protectedText, placeholders } = protectMathRegions(text);

  const rawMarkers = [];
  let m;
  const re = new RegExp(INLINE_MCQ_MARKER.source, 'gi');
  while ((m = re.exec(protectedText)) !== null) {
    const label = (m[2] || m[4] || '').toLowerCase();
    rawMarkers.push({ index: m.index, label, len: m[0].length });
  }

  const markers = getValidMcqMarkers(rawMarkers);

  if (markers.length >= 2) {
    const options = [];
    for (let i = 0; i < markers.length; i += 1) {
      const start = markers[i].index + markers[i].len;
      const end = i + 1 < markers.length ? markers[i + 1].index : protectedText.length;
      let chunk = protectedText.slice(start, end).replace(/^[\s).:\-–—]+/, '').trim();
      chunk = wrapOptionFractions(chunk);
      if (chunk) {
        options.push({
          label: markers[i].label,
          text: restoreMathRegions(chunk, placeholders),
          image: null,
          latex: null,
        });
      }
    }
    const stem = restoreMathRegions(protectedText.slice(0, markers[0].index).trim(), placeholders);
    return { stem, options: dedupeByLabel(options) };
  }

  const lineOpts = [];
  const stemLines = [];
  const lines = protectedText.split('\n');
  for (const line of lines) {
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
    const restoredOptions = dedupeByLabel(lineOpts).map(o => ({
      ...o,
      text: restoreMathRegions(o.text, placeholders)
    }));
    const stem = restoreMathRegions(stemLines.join('\n').trim(), placeholders);
    return {
      stem,
      options: restoredOptions,
    };
  }

  return { stem: text, options: [] };
}

export function countMcqOptionMarkers(text) {
  if (!text) return 0;
  const { text: protectedText } = protectMathRegions(text);
  const labels = new Set();
  const re = new RegExp(INLINE_MCQ_MARKER.source, 'gi');
  let m;
  while ((m = re.exec(protectedText)) !== null) {
    const label = (m[2] || m[4] || '').toLowerCase();
    labels.add(label);
  }
  return labels.size;
}

export function hasMcqOptionPattern(text) {
  return countMcqOptionMarkers(text) >= 2;
}
