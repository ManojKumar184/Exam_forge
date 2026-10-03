import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import katex from 'katex';
import path from 'path';
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

function xmlLocalName(name) {
  return String(name || '').split(':').pop().toLowerCase();
}

function findXmlElementRanges(xml, wantedNames, parentName = null) {
  const wanted = new Set(wantedNames.map(xmlLocalName));
  const stack = [];
  const found = [];
  const tokenRe = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<\/?[\w:.-]+\b[^>]*>/g;
  let token;
  while ((token = tokenRe.exec(xml))) {
    const raw = token[0];
    if (raw.startsWith('<!--') || raw.startsWith('<?') || raw.startsWith('<!')) continue;
    const close = /^<\//.test(raw);
    const selfClosing = /\/\s*>$/.test(raw);
    const name = raw.match(/^<\/?([\w:.-]+)/)?.[1];
    if (!name) continue;
    const local = xmlLocalName(name);
    if (!close) {
      const parent = stack.at(-1) || null;
      if (selfClosing) {
        if (wanted.has(local) && (!parentName || parent?.local === parentName)) {
          found.push({ local, start: token.index, end: tokenRe.lastIndex, xml: raw, parent: parent?.local || null });
        }
      } else {
        stack.push({ name, local, start: token.index, parent: parent?.local || null });
      }
      continue;
    }
    let idx = stack.length - 1;
    while (idx >= 0 && stack[idx].name !== name) idx -= 1;
    if (idx < 0) continue;
    const [node] = stack.splice(idx, 1);
    if (wanted.has(node.local) && (!parentName || node.parent === parentName)) {
      found.push({ local: node.local, start: node.start, end: tokenRe.lastIndex, xml: xml.slice(node.start, tokenRe.lastIndex), parent: node.parent });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

function relationshipEntries(xml = '') {
  const entries = new Map();
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w:.-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [xmlLocalName(m[1]), m[2]]));
    if (attrs.id && attrs.target) entries.set(attrs.id, attrs);
  }
  return entries;
}

function relationshipPartPath(target) {
  if (!target || /^[a-z]+:/i.test(target)) return null;
  const normalized = target.startsWith('/')
    ? path.posix.normalize(target.slice(1))
    : path.posix.normalize(path.posix.join('word', target));
  if (!normalized.startsWith('word/') || normalized.includes('/../')) return null;
  return normalized;
}

function relationshipIds(xml = '') {
  return [...new Set([...xml.matchAll(/\b(?:r:embed|r:id|r:link)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]))];
}

function plainTextFromFragment(xml) {
  return extractParagraphTextFromNodes(parseXml(xml) || []);
}

function normalizeEquationLatex(latex) {
  const symbols = {
    '⁡': '', 'π': '\\pi ', 'θ': '\\theta ', 'α': '\\alpha ', 'β': '\\beta ',
    'γ': '\\gamma ', 'Δ': '\\Delta ', 'δ': '\\delta ', 'λ': '\\lambda ',
    'μ': '\\mu ', 'σ': '\\sigma ', 'Ω': '\\Omega ', 'ω': '\\omega ',
    '∞': '\\infty ', '→': '\\to ', '←': '\\leftarrow ', '≤': '\\le ', '≥': '\\ge ',
    '≠': '\\ne ', '×': '\\times ', '·': '\\cdot ', '√': '\\sqrt{}',
  };
  return String(latex || '').replace(/[⁡πθαβγΔδλμσΩω∞→←≤≥≠×·√]/g, (char) => symbols[char] ?? char).trim();
}

function validateLatex(latex) {
  if (!latex) return false;
  try { katex.renderToString(latex, { throwOnError: true, strict: 'error' }); return true; }
  catch { return false; }
}

function orderedContentBlocks(paragraphXml, assets) {
  const candidates = findXmlElementRanges(paragraphXml, ['oMathPara', 'oMath', 'object', 'drawing', 'pict']);
  const objects = candidates.filter((range) => range.local === 'object');
  const equations = candidates.filter((range) => range.local === 'omathpara' || range.local === 'omath')
    .filter((range) => !candidates.some((outer) => outer.local === 'omathpara' && outer.start < range.start && outer.end > range.end));
  const visualNodes = candidates.filter((range) => ['drawing', 'pict'].includes(range.local));
  const special = [...equations, ...objects, ...visualNodes].sort((a, b) => a.start - b.start || b.end - a.end);
  const topLevel = [];
  for (const range of special) {
    if (topLevel.some((outer) => outer.start <= range.start && outer.end >= range.end)) continue;
    topLevel.push(range);
  }

  const blocks = [];
  const addText = (value) => {
    const text = value.replace(/\s+/g, ' ').trim();
    if (text) blocks.push({ type: 'text', text });
  };
  let cursor = 0;
  for (const range of topLevel) {
    addText(plainTextFromFragment(paragraphXml.slice(cursor, range.start)));
    if (range.local === 'omath' || range.local === 'omathpara') {
      const ast = parseXml(range.xml) || [];
      let latex = '';
      let warning = null;
      try { latex = normalizeEquationLatex(translateOmmlNode(ast[0])); } catch { warning = 'OMML could not be normalized to LaTeX'; }
      const latexIsValid = validateLatex(latex);
      if (latex && !latexIsValid) warning = 'Generated LaTeX failed math-render validation; original OMML was retained';
      blocks.push({
        type: 'equation', source: 'omml', omml: range.xml, original: range.xml,
        latex: latex || null, displayMode: range.local === 'omathpara',
        fidelity: latexIsValid ? 0.98 : (latex ? 0.55 : 0.25), warning,
      });
      if (latex) blocks.push({ type: 'text', text: '' });
    } else if (range.local === 'object') {
      const progId = range.xml.match(/\bProgID\s*=\s*["']([^"']+)["']/i)?.[1] || null;
      const relId = range.xml.match(/\br:id\s*=\s*["']([^"']+)["']/i)?.[1] || null;
      const isMathType = /mathtype|equation\.(?:3|dsmt4)/i.test(progId || '');
      const previewRelationshipIds = relationshipIds(range.xml).filter((id) => id !== relId && assets.has(id));
      if (isMathType) {
        blocks.push({
          type: 'equation', source: 'mathtype', original: range.xml,
          originalRelationshipId: relId, originalAsset: relId && assets.has(relId) ? relId : null,
          progId, latex: null, displayMode: false, previewRelationshipIds,
          fidelity: relId && assets.has(relId) ? 0.6 : 0.35,
          warning: 'MathType source preserved; automatic conversion to LaTeX is unavailable for this OLE object',
        });
      } else if (relId && assets.has(relId)) {
        blocks.push({ type: 'embedded', original: range.xml, relationshipId: relId, fidelity: 0.5, warning: 'Embedded object requires review' });
      } else {
        blocks.push({ type: 'embedded', original: range.xml, relationshipId: relId, fidelity: 0.25, warning: 'Unsupported embedded object preserved for review' });
      }
    } else {
      const ids = relationshipIds(range.xml).filter((id) => assets.has(id));
      if (ids.length) {
        for (const relationshipId of ids) blocks.push({ type: 'image', relationshipId, source: 'embedded', fidelity: 1 });
      } else {
        blocks.push({ type: 'embedded', original: range.xml, fidelity: 0.4, warning: 'Drawing preserved but no embedded image relationship was found' });
      }
    }
    cursor = range.end;
  }
  addText(plainTextFromFragment(paragraphXml.slice(cursor)));
  return blocks.filter((block) => block.type !== 'text' || block.text);
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

function extractTableStructureFromNode(tblNode, assets = new Map()) {
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
      const contentBlocks = [];
      for (const p of ps) {
        cellHtml += convertXmlNodeToHtml(p);
      }

      let cellText = cellHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (cellText) contentBlocks.push({ type: 'text', text: cellText });
      textCells.push(cellText);
      cells.push({
        text: cellText,
        html: cellHtml,
        contentBlocks,
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
        contentBlocks: cell.contentBlocks || [],
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
  const rawBodyElements = findXmlElementRanges(docXml, ['p', 'tbl'], 'body');
  const relXml = await zip.file('word/_rels/document.xml.rels')?.async('string') || '';
  const relationships = relationshipEntries(relXml);
  const relationshipAssets = new Map();
  let totalAssetBytes = 0;
  for (const [id, rel] of relationships) {
    if (rel.targetmode?.toLowerCase() === 'external') continue;
    const target = relationshipPartPath(rel.target);
    const part = target && zip.file(target);
    const imageRelationship = /\/image$/i.test(rel.type || '');
    const oleRelationship = /oleobject|package/i.test(rel.type || '');
    if (!part || (!imageRelationship && !oleRelationship)) continue;
    const declaredSize = part._data?.uncompressedSize || 0;
    if (declaredSize > 20 * 1024 * 1024 || totalAssetBytes + declaredSize > 80 * 1024 * 1024) continue;
    const data = await part.async('nodebuffer');
    if (!data.length || data.length > 20 * 1024 * 1024 || totalAssetBytes + data.length > 80 * 1024 * 1024) continue;
    totalAssetBytes += data.length;
    relationshipAssets.set(id, {
      relationshipId: id,
      target,
      type: imageRelationship ? 'image' : 'ole',
      contentType: part.name.toLowerCase().endsWith('.emf') ? 'image/emf' : part.name.toLowerCase().endsWith('.wmf') ? 'image/wmf' : null,
      extension: path.posix.extname(part.name).slice(1).toLowerCase() || 'bin',
      data,
    });
  }

  const paragraphs = [];
  const tables = [];
  let section = 'General';

  const parsedTables = asArray(body.tbl);
  let tblIdx = 0;

  for (const [childIndex, child] of orderedBodyChildren.entries()) {
    const tagName = nodeTag(child);
    const rawElement = rawBodyElements[childIndex];

    if (tagName === 'tbl') {
      const tblNode = parsedTables[tblIdx++];
      if (tblNode) {
        const parsedTable = extractTableStructureFromNode(child, relationshipAssets);
        const tableText = parsedTable ? parsedTable.text : extractTableText(tblNode);
        const tableModel = parsedTable ? parsedTable.tableModel : { rows: [] };
        if (rawElement && tableModel.rows?.length) {
          const rawCells = findXmlElementRanges(rawElement.xml, ['tc'], 'tr');
          let cellIndex = 0;
          for (const row of tableModel.rows) {
            for (const cell of row || []) {
              if (!cell) continue;
              const rawCell = rawCells[cellIndex++];
              if (!rawCell) continue;
              const paragraphRanges = findXmlElementRanges(rawCell.xml, ['p'], 'tc');
              const ordered = paragraphRanges.flatMap((p) => orderedContentBlocks(p.xml, relationshipAssets));
              if (ordered.length) cell.contentBlocks = ordered;
            }
          }
        }
        tables.push({ text: tableText, tableModel, section });
        paragraphs.push({
          text: `[TABLE_START]\n${tableText}\n[TABLE_END]`,
          isTable: true,
          tableModel,
          contentBlocks: [{ type: 'table', ...tableModel, fidelity: 0.95 }],
          section
        });
      }
    } else {
      const text = extractParagraphTextFromNodes([child]);
      const contentBlocks = rawElement ? orderedContentBlocks(rawElement.xml, relationshipAssets) : (text ? [{ type: 'text', text }] : []);
      if (!text && !contentBlocks.length) continue;

      const header = detectSectionHeader(text);
      if (header) {
        section = header.name;
        paragraphs.push({ text, contentBlocks, isSection: true, section, numbering: null });
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
        contentBlocks,
        section,
        numbering: num,
        style: attrValue(firstChild(pPr, 'pstyle'), 'val'),
      });
    }
  }

  const rawText = paragraphs.map((p) => p.text).join('\n');
  return { paragraphs, tables, rawText, relationshipAssets };
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
