/**
 * Shared Export Utilities — used by both paperDocxService.js and paperExportHtml.js.
 * Eliminates code duplication for content parsing, section grouping, and table rendering.
 */

/**
 * Decode HTML entities in a string.
 */
export function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x2F;/gi, '/');
}

/**
 * Split content into text and math parts by LaTeX delimiters.
 */
export function splitContentParts(raw) {
  if (!raw?.trim()) return [];
  const parts = [];
  let remaining = raw;
  let safety = 0;
  while (remaining.length > 0 && safety < 200) {
    safety += 1;
    const displayMatch = remaining.match(/\$\$([\s\S]+?)\$\$/) || remaining.match(/\\\[([\s\S]+?)\\\]/);
    const inlineMatch = remaining.match(/\$([^$\n]+?)\$/) || remaining.match(/\\\(([\s\S]+?)\\\)/);

    const displayIndex = displayMatch ? remaining.indexOf(displayMatch[0]) : -1;
    const inlineIndex = inlineMatch ? remaining.indexOf(inlineMatch[0]) : -1;

    let useDisplay = false;
    let match = null;

    if (displayIndex >= 0 && (inlineIndex < 0 || displayIndex <= inlineIndex)) {
      useDisplay = true;
      match = displayMatch;
    } else if (inlineIndex >= 0) {
      match = inlineMatch;
    }

    if (!match || match.index === undefined) {
      parts.push({ type: 'text', value: remaining });
      break;
    }

    const matchIndex = remaining.indexOf(match[0]);
    if (matchIndex > 0) {
      parts.push({ type: 'text', value: remaining.slice(0, matchIndex) });
    }

    const latex = match[1] || match[2] || '';
    parts.push({ type: 'math', value: latex.trim(), display: useDisplay });
    remaining = remaining.slice(matchIndex + match[0].length);
  }
  return parts;
}

/**
 * Group paper questions by section for rendering.
 * Returns array of { key, title, items } sorted by question order.
 */
export function groupBySection(paper) {
  const map = new Map();
  for (const pq of paper.questions || []) {
    const key = pq.section || 'A';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(pq);
  }
  const sectionMeta = new Map((paper.sections || []).map((s) => [s.name, s]));
  return [...map.entries()].map(([sectionKey, items]) => {
    const meta = sectionMeta.get(sectionKey);
    return {
      key: sectionKey,
      title: meta?.name || `Section ${sectionKey}`,
      items: items.sort((a, b) => (a.question_order ?? 0) - (b.question_order ?? 0)),
    };
  });
}

/**
 * Render a JSON table structure to a markdown-like plain text representation
 * suitable for DOCX text-based rendering.
 */
export function tableToMarkdown(tableJson) {
  if (!tableJson || !tableJson.rows || !tableJson.rows.length) return '';
  const rows = [];
  for (let rIdx = 0; rIdx < tableJson.rows.length; rIdx++) {
    const row = tableJson.rows[rIdx];
    const cells = row.map((cell) => {
      const text = (typeof cell === 'object' && cell !== null) ? (cell.text || '') : String(cell || '');
      return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    });
    rows.push('| ' + cells.join(' | ') + ' |');
  }
  if (rows.length > 1) {
    const cellCount = rows[0].split('|').length - 2;
    if (cellCount > 0) {
      const sep = '| ' + Array(cellCount).fill('---').join(' | ') + ' |';
      rows.splice(1, 0, sep);
    }
  }
  return '\n\n' + rows.join('\n') + '\n\n';
}

/**
 * Format question type for display labels in export outputs.
 */
export const Q_TYPE_LABEL_MAP = {
  mcq: 'MCQ',
  MCQ_SINGLE: 'MCQ (Single)',
  MCQ_MULTI: 'MCQ (Multiple)',
  MCQ_MULTIPLE: 'MCQ (Multiple)',
  numerical: 'Numerical',
  NUMERICAL: 'Numerical',
  INTEGER: 'Integer',
  NUMERICAL_INTEGER: 'Numerical',
  descriptive: 'Descriptive',
  DESCRIPTIVE: 'Descriptive',
  ASSERTION_REASON: 'Assertion/Reason',
  MATCH_COLUMNS: 'Match the Following',
  MATCH_FOLLOWING: 'Match the Following',
  COMPREHENSION: 'Comprehension',
  PARAGRAPH_BASED: 'Comprehension',
  STATEMENT_SET: 'Statement Set',
  MATRIX_MATCH: 'Matrix Match',
  TRUE_FALSE: 'True/False',
  NESTED_OPTION_MCQ: 'MCQ (Nested)',
  CASE_STUDY: 'Case Study',
};

export function getQuestionTypeLabel(type) {
  if (!type) return '';
  return Q_TYPE_LABEL_MAP[type] || Q_TYPE_LABEL_MAP[type.toUpperCase()] || type;
}
