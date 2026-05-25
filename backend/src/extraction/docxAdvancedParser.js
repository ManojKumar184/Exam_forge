import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { preprocessDocumentText } from './columnReadingOrder.js';
import { detectSectionHeader } from './sectionParser.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

function asArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function extractRunText(run) {
  if (!run) return '';
  if (typeof run === 'string') return run;
  if (run.t) {
    const ts = asArray(run.t);
    return ts.map((t) => (typeof t === 'string' ? t : t['#text'] || '')).join('');
  }
  return '';
}

function extractParagraphText(p) {
  const runs = asArray(p.r);
  let text = runs.map(extractRunText).join('');
  if (p.t) text += typeof p.t === 'string' ? p.t : p.t['#text'] || '';
  return text.trim();
}

function getNumberingProps(p) {
  const pPr = p.pPr;
  if (!pPr?.numPr) return null;
  return {
    numId: pPr.numPr.numId?.['@_val'],
    ilvl: pPr.numPr.ilvl?.['@_val'] ?? '0',
  };
}

function extractTableText(tbl) {
  const rows = asArray(tbl.tr);
  return rows
    .map((row) =>
      asArray(row.tc)
        .map((cell) => asArray(cell.p).map(extractParagraphText).filter(Boolean).join(' '))
        .join(' | ')
    )
    .join('\n');
}

/**
 * Parse word/document.xml for paragraph order, numbering, tables.
 */
export async function parseDocxXmlStructure(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) return { paragraphs: [], tables: [], rawText: '' };

  const doc = parser.parse(docXml);
  const body = doc?.document?.body;
  if (!body) return { paragraphs: [], tables: [], rawText: '' };

  const paragraphs = [];
  const tables = [];
  let section = 'General';

  const bodyChildren = mergeBodyOrder(body);

  for (const item of bodyChildren) {
    if (item.type === 'tbl') {
      const tableText = extractTableText(item.node);
      tables.push({ text: tableText, section });
      paragraphs.push({ text: `[TABLE]\n${tableText}`, isTable: true, section });
      continue;
    }

    const text = extractParagraphText(item.node);
    if (!text) continue;

    const header = detectSectionHeader(text);
    if (header) {
      section = header.name;
      paragraphs.push({ text, isSection: true, section, numbering: null });
      continue;
    }

    const num = getNumberingProps(item.node);
    paragraphs.push({
      text,
      section,
      numbering: num,
      isQuestionStart: /^(?:Q\s*)?\d{1,3}[\).:\-\s]/i.test(text),
    });
  }

  const rawText = paragraphs.map((p) => p.text).join('\n');
  return { paragraphs, tables, rawText };
}

function mergeBodyOrder(body) {
  const items = [];
  for (const p of asArray(body.p)) items.push({ type: 'p', node: p });
  for (const t of asArray(body.tbl)) items.push({ type: 'tbl', node: t });
  return items;
}

/**
 * Build reading-ordered plain text from XML paragraphs.
 */
export function buildTextFromDocxStructure(structure) {
  const lines = [];
  for (const p of structure.paragraphs || []) {
    if (p.isSection) {
      lines.push('');
      lines.push(p.text);
      continue;
    }
    lines.push(p.text);
  }
  return preprocessDocumentText(lines.join('\n'));
}

/**
 * Align HTML segments to parsed blocks.
 */
export function alignHtmlSegmentsToBlocks(blocks, htmlSegments) {
  if (!htmlSegments?.length) return blocks;

  return blocks.map((block, idx) => {
    const qNum = block.questionNumber;
    let segment =
      htmlSegments.find((s) => qNum && new RegExp(`\\b${qNum}[\\).:\\s]`).test(s.text || '')) ||
      htmlSegments[idx];

    if (!segment && block.lines?.length) {
      const head = block.lines[0].slice(0, 48);
      segment = htmlSegments.find((s) => s.text?.includes(head));
    }

    return segment ? { ...block, html: segment.html, segmentIndex: segment.index } : block;
  });
}
