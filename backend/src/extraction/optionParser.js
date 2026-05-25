/**
 * MCQ option detection — coaching layouts, OCR spacing, inline (a)(b)(c)(d).
 */

const OPTION_LINE_START =
  /^\s*(?:\(?\s*([a-dA-D])\s*\)?\s*[\).:\-–—]\s*)(.+)$/;

const INLINE_OPTION_CHUNK =
  /(?:^|[\s;])(?:\(?\s*([a-dA-D])\s*\)?\s*[\).:\-–—]\s*)([\s\S]*?)(?=(?:[\s;]\(?\s*[a-dA-D]\s*\)?\s*[\).:\-–—])|$)/gi;

export function isOptionLine(line) {
  return OPTION_LINE_START.test(line.trim());
}

export function parseOptionLine(line) {
  const m = line.trim().match(OPTION_LINE_START);
  if (!m) return null;
  return {
    label: m[1].toLowerCase(),
    text: (m[2] || '').trim(),
    image: null,
    latex: null,
  };
}

/**
 * Pull (a)(b)(c)(d) options embedded in question body text.
 */
export function extractInlineOptions(text) {
  if (!text) return { stem: text, options: [] };
  const options = [];
  let stem = text;

  const markerRe = /\(\s*([a-dA-D])\s*\)/g;
  const markers = [];
  let m;
  while ((m = markerRe.exec(text)) !== null) {
    markers.push({ index: m.index, label: m[1].toLowerCase() });
  }

  if (markers.length >= 2) {
    for (let i = 0; i < markers.length; i += 1) {
      const start = markers[i].index + 3;
      const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
      const chunk = text.slice(start, end).replace(/^[\s).:\-–—]+/, '').trim();
      if (chunk.length > 0) {
        options.push({ text: chunk, image: null, latex: null, label: markers[i].label });
      }
    }
    stem = text.slice(0, markers[0].index).trim();
  }

  if (options.length < 2) {
    const lines = text.split('\n');
    const lineOpts = [];
    let stemLines = [];
    for (const line of lines) {
      const parsed = parseOptionLine(line);
      if (parsed) lineOpts.push(parsed);
      else stemLines.push(line);
    }
    if (lineOpts.length >= 2) {
      return {
        stem: stemLines.join('\n').trim(),
        options: lineOpts.map(({ text: t, image, latex }) => ({ text: t, image, latex })),
      };
    }
  }

  return {
    stem: stem || text,
    options: options.map(({ text: t, image, latex }) => ({ text: t, image, latex })),
  };
}

export function countOptionMarkers(text) {
  if (!text) return 0;
  const labels = new Set();
  const patterns = [
    /\(\s*([a-dA-D])\s*\)/g,
    /(?:^|\s)([a-dA-D])[\).:\-–—]\s/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) labels.add(m[1].toLowerCase());
  }
  return labels.size;
}

export function hasMcqOptionPattern(text) {
  return countOptionMarkers(text) >= 2 || /\(\s*[a-dA-D]\s*\).*\(\s*[a-dA-D]\s*\)/s.test(text || '');
}
