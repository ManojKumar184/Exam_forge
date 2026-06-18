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

function nodeTag(node) {
  return typeof node === 'string' ? '' : String(node?.tag || '').toLowerCase();
}

function childrenOf(node, tag = null) {
  const children = (node?.children || []).filter((child) => typeof child !== 'string');
  return tag ? children.filter((child) => nodeTag(child) === tag.toLowerCase()) : children;
}

function firstChild(node, tag) {
  return childrenOf(node, tag)[0] || null;
}

function attrValue(node, name) {
  return node?.attrs?.[name] || node?.attrs?.[`w:${name}`] || null;
}

function findFirstNode(nodes, tag) {
  for (const node of nodes || []) {
    if (typeof node === 'string') continue;
    if (nodeTag(node) === tag.toLowerCase()) return node;
    const found = findFirstNode(node.children || [], tag);
    if (found) return found;
  }
  return null;
}

function extractParagraphTextFromXml(pXml) {
  const root = parseXml(pXml);
  if (!root || !root.length) return '';
  return extractParagraphTextFromNodes(root);
}

function extractParagraphTextFromNodes(root) {
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

function convertXmlNodeToHtml(node) {
  if (!node) return '';
  if (typeof node === 'string') {
    return node;
  }
  const tag = (node.tag || '').toLowerCase();

  if (tag === 'omath' || tag === 'omathpara') {
    const latex = translateOmmlNode(node);
    return ` $${latex.trim()}$ `;
  }

  if (tag === 't') {
    return (node.children || []).join('');
  }

  if (tag === 'r') {
    let html = '';
    const rPr = (node.children || []).find(n => n && typeof n !== 'string' && (n.tag || '').toLowerCase() === 'rpr');
    let isBold = false;
    let isItalic = false;
    let isSup = false;
    let isSub = false;
    if (rPr) {
      isBold = (rPr.children || []).some(n => n && typeof n !== 'string' && (n.tag || '').toLowerCase() === 'b');
      isItalic = (rPr.children || []).some(n => n && typeof n !== 'string' && (n.tag || '').toLowerCase() === 'i');
      const vertAlign = (rPr.children || []).find(n => n && typeof n !== 'string' && (n.tag || '').toLowerCase() === 'vertalign');
      if (vertAlign && vertAlign.attrs) {
        const val = vertAlign.attrs.val || vertAlign.attrs['w:val'];
        if (val === 'superscript') isSup = true;
        if (val === 'subscript') isSub = true;
      }
    }
    
    let childrenHtml = '';
    if (node.children) {
      for (const child of node.children) {
        if (child && typeof child !== 'string' && (child.tag || '').toLowerCase() === 'rpr') continue;
        childrenHtml += convertXmlNodeToHtml(child);
      }
    }
    
    if (isBold) childrenHtml = `<strong>${childrenHtml}</strong>`;
    if (isItalic) childrenHtml = `<em>${childrenHtml}</em>`;
    if (isSup) childrenHtml = `<sup>${childrenHtml}</sup>`;
    if (isSub) childrenHtml = `<sub>${childrenHtml}</sub>`;
    
    return childrenHtml;
  }

  if (tag === 'p') {
    let childrenHtml = '';
    const pPr = (node.children || []).find(n => n && typeof n !== 'string' && (n.tag || '').toLowerCase() === 'ppr');
    let prefix = '';
    if (pPr) {
      const numPr = (pPr.children || []).find(n => n && typeof n !== 'string' && (n.tag || '').toLowerCase() === 'numpr');
      if (numPr) {
        prefix = '• ';
      }
    }
    if (node.children) {
      for (const child of node.children) {
        if (child && typeof child !== 'string' && (child.tag || '').toLowerCase() === 'ppr') continue;
        childrenHtml += convertXmlNodeToHtml(child);
      }
    }
    return `<p>${prefix}${childrenHtml}</p>`;
  }

  let html = '';
  if (node.children) {
    for (const child of node.children) {
      html += convertXmlNodeToHtml(child);
    }
  }
  return html;
}

function extractTableStructureFromXml(tableXml) {
  const root = parseXml(tableXml);
  if (!root || !root.length) return null;

  const tblNode = findFirstNode(root, 'tbl');
  if (!tblNode) return null;
  return extractTableStructureFromNode(tblNode);
}

function extractTableStructureFromNode(tblNode) {
  const rows = [];
  const textRows = [];

  const trs = childrenOf(tblNode, 'tr');
  for (const tr of trs) {
    const cells = [];
    const textCells = [];
    const tcs = childrenOf(tr, 'tc');
    for (const tc of tcs) {
      let colspan = 1;
      let rowspan = 1;

      const tcPr = firstChild(tc, 'tcpr');
      if (tcPr) {
        const gridSpan = firstChild(tcPr, 'gridspan');
        const spanValue = attrValue(gridSpan, 'val');
        if (spanValue) {
          colspan = parseInt(spanValue, 10) || 1;
        }
        const vMerge = firstChild(tcPr, 'vmerge');
        if (vMerge) {
          const val = attrValue(vMerge, 'val');
          if (val === 'restart') {
            rowspan = 'restart';
          } else {
            rowspan = 'continue';
          }
        }
      }

      let cellHtml = '';
      const ps = childrenOf(tc, 'p');
      for (const p of ps) {
        cellHtml += convertXmlNodeToHtml(p);
      }

      let cellText = cellHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      textCells.push(cellText);
      cells.push({
        text: cellText,
        html: cellHtml,
        colspan,
        rowspan
      });
    }
    if (cells.length) {
      rows.push(cells);
      textRows.push(textCells.join(' | '));
    }
  }

  // Resolve rowspans
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const cell = rows[r][c];
      if (cell.rowspan === 'restart') {
        let span = 1;
        for (let nextR = r + 1; nextR < rows.length; nextR++) {
          const nextCell = rows[nextR][c];
          if (nextCell && nextCell.rowspan === 'continue') {
            span++;
            nextCell.rowspan = 0;
          } else {
            break;
          }
        }
        cell.rowspan = span;
      } else if (cell.rowspan === 'continue') {
        cell.rowspan = 0;
      }
    }
  }

  const finalRows = rows.map(row => {
    return row.map(cell => {
      if (cell.rowspan === 0) return null;
      return {
        text: cell.text,
        html: cell.html,
        colspan: cell.colspan,
        rowspan: cell.rowspan
      };
    }).filter(c => c !== null);
  });

  return {
    text: textRows.join('\n'),
    tableModel: { rows: finalRows }
  };
}

function extractTableText(tbl) {
  // Fallback for direct usage, though we will parse via XML
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
  const parsedRoot = parseXml(docXml);
  const bodyNode = findFirstNode(parsedRoot, 'body');
  const orderedBodyChildren = childrenOf(bodyNode).filter((child) => ['p', 'tbl'].includes(nodeTag(child)));

  const paragraphs = [];
  const tables = [];
  let section = 'General';

  const parsedTables = asArray(body.tbl);
  let tblIdx = 0;

  for (const child of orderedBodyChildren) {
    const tagName = nodeTag(child);

    if (tagName === 'tbl') {
      const tblNode = parsedTables[tblIdx++];
      if (tblNode) {
        const parsedTable = extractTableStructureFromNode(child);
        const tableText = parsedTable ? parsedTable.text : extractTableText(tblNode);
        const tableModel = parsedTable ? parsedTable.tableModel : { rows: [] };
        tables.push({ text: tableText, tableModel, section });
        paragraphs.push({
          text: `[TABLE_START]\n${tableText}\n[TABLE_END]`,
          isTable: true,
          tableModel,
          section
        });
      }
    } else {
      const text = extractParagraphTextFromNodes([child]);
      if (!text) continue;

      const header = detectSectionHeader(text);
      if (header) {
        section = header.name;
        paragraphs.push({ text, isSection: true, section, numbering: null });
        continue;
      }

      let num = null;
      const pPr = firstChild(child, 'ppr');
      const numPr = firstChild(pPr, 'numpr');
      if (numPr) {
        const numIdNode = firstChild(numPr, 'numid');
        const ilvlNode = firstChild(numPr, 'ilvl');
        num = {
          numId: attrValue(numIdNode, 'val'),
          ilvl: attrValue(ilvlNode, 'val') || '0',
        };
      }

      paragraphs.push({
        text,
        section,
        numbering: num,
        style: attrValue(firstChild(pPr, 'pstyle'), 'val'),
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

  const normalizeText = (text) => (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  return blocks.map((block, idx) => {
    const qNum = block.questionNumber;
    let segment = null;
    
    if (qNum) {
      segment = htmlSegments.find((s) => new RegExp(`\\b${qNum}[\\).:\\s]`).test(s.text || ''));
    }
    
    if (!segment && block.lines?.length) {
      const blockNorm = normalizeText(block.lines[0]).slice(0, 50);
      if (blockNorm) {
        segment = htmlSegments.find((s) => {
          const segNorm = normalizeText(s.text || '');
          return segNorm.includes(blockNorm);
        });
      }
    }

    if (!segment) {
      if (block.lines?.length) {
        const head = block.lines[0].slice(0, 30).trim();
        if (head.length > 5) {
          segment = htmlSegments.find((s) => s.text?.includes(head));
        }
      }
    }

    return segment ? { ...block, html: segment.html, segmentIndex: segment.index } : block;
  });
}
