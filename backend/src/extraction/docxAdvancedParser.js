import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { preprocessDocumentText } from './columnReadingOrder.js';
import { detectSectionHeader } from './sectionParser.js';
import { parseXml, translateOmmlNode } from './mathConverter.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

function asArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function extractParagraphTextFromXml(pXml) {
  const root = parseXml(pXml);
  if (!root || !root.length) return '';

  let text = '';

  function walk(node) {
    if (typeof node === 'string') {
      text += node;
      return;
    }
    const tag = node.tag.toLowerCase();

    if (tag === 'omath' || tag === 'omathpara') {
      const latex = translateOmmlNode(node);
      text += ` $${latex.trim()}$ `;
      return;
    }

    if (tag === 't') {
      text += (node.children || []).join('');
      return;
    }

    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  for (const node of root) {
    walk(node);
  }

  return text.trim();
}

function extractTableText(tbl) {
  const rows = asArray(tbl.tr);
  return rows
    .map((row) =>
      asArray(row.tc)
        .map((cell) => {
          const cellParagraphs = asArray(cell.p);
          return cellParagraphs
            .map((p) => {
              if (p.r) {
                return asArray(p.r)
                  .map((r) => {
                    if (r.t) {
                      return typeof r.t === 'string' ? r.t : r.t['#text'] || '';
                    }
                    return '';
                  })
                  .join('');
              }
              return '';
            })
            .join(' ')
            .trim();
        })
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

  // Use regex to locate all w:p and w:tbl tags in exact document XML order
  const regex = /<(w:p|w:tbl)\b([\s\S]*?)<\/\1>/g;
  const parsedTables = asArray(body.tbl);
  let tblIdx = 0;

  let match;
  while ((match = regex.exec(docXml)) !== null) {
    const tagName = match[1];
    const fullXml = match[0];

    if (tagName === 'w:tbl') {
      const tblNode = parsedTables[tblIdx++];
      if (tblNode) {
        const tableText = extractTableText(tblNode);
        tables.push({ text: tableText, section });
        paragraphs.push({ text: `[TABLE]\n${tableText}`, isTable: true, section });
      }
    } else {
      const text = extractParagraphTextFromXml(fullXml);
      if (!text) continue;

      const header = detectSectionHeader(text);
      if (header) {
        section = header.name;
        paragraphs.push({ text, isSection: true, section, numbering: null });
        continue;
      }

      // Check numbering properties in paragraph XML
      const numPrMatch = fullXml.match(/<w:numPr>([\s\S]*?)<\/w:numPr>/);
      let num = null;
      if (numPrMatch) {
        const numIdM = numPrMatch[1].match(/<w:numId w:val="([^"]+)"/);
        const ilvlM = numPrMatch[1].match(/<w:ilvl w:val="([^"]+)"/);
        num = {
          numId: numIdM ? numIdM[1] : null,
          ilvl: ilvlM ? ilvlM[1] : '0',
        };
      }

      paragraphs.push({
        text,
        section,
        numbering: num,
        isQuestionStart: /^(?:Q\s*)?\d{1,3}[\).:\-\s]/i.test(text),
      });
    }
  }

  const rawText = paragraphs.map((p) => p.text).join('\n');
  return { paragraphs, tables, rawText };
}

/**
 * Build reading-ordered plain text from XML paragraphs.
 */
export function buildTextFromDocxStructure(structure) {
  const lines = [];
  const listCounters = {};

  for (const p of structure.paragraphs || []) {
    if (p.isSection) {
      lines.push('');
      lines.push(p.text);
      continue;
    }

    let prefix = '';
    if (p.numbering && p.numbering.numId) {
      const numId = p.numbering.numId;
      const ilvl = p.numbering.ilvl || '0';

      if (!listCounters[numId]) {
        listCounters[numId] = {};
      }
      if (listCounters[numId][ilvl] === undefined) {
        listCounters[numId][ilvl] = 0;
      }
      listCounters[numId][ilvl]++;

      const currentCount = listCounters[numId][ilvl];
      const numPattern = new RegExp(`^(?:Q(?:uestion)?\\s*)?${currentCount}\\b`, 'i');
      const generalNumPattern = /^(?:Q(?:uestion)?\\s*)?\d{1,3}[\).:\-\s]/i;
      
      if (!numPattern.test(p.text) && !generalNumPattern.test(p.text)) {
        prefix = `${currentCount}. `;
      }
    }

    lines.push(prefix + p.text);
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
