import { convertHtmlMathToLatex } from './mathConverter';

export type BlockType = 'paragraph' | 'equation' | 'option' | 'table' | 'list_item';

export interface SemanticBlock {
  type: BlockType;
  content: string;
  label?: string; // e.g. 'A', 'B' for options or index for list items
}

const OPTION_START = /^\s*(?:\(?\s*([a-dA-D])\s*\)?\s*[\).:\-–—]\s*|([a-dA-D])\s*[\).:\-–—]\s+)/i;
const OPTION_LINE_START = /^\s*(?:\(?\s*([a-dA-D])\s*\)?\s*[\).:\-–—]\s*|([a-dA-D])\s*[\).:\-–—]\s+)(.+)$/i;

const QUESTION_START_RE =
  /^(?:Q(?:uestion)?\s*)?(\d{1,3})[\).:\-\s]+|^\((\d{1,3})\)\s+|^(\d{1,3})\.\s+(?=[A-Za-z(\\$])/i;

/**
 * Intercept clipboard paste event and extract core formats.
 */
export function extractClipboardData(e: ClipboardEvent): { html: string; plain: string } {
  const html = e.clipboardData?.getData('text/html') || '';
  const plain = e.clipboardData?.getData('text/plain') || '';
  return { html, plain };
}

/**
 * Remove option prefixes like "(A)" or "A." from the clean HTML string.
 */
function removeOptionPrefix(html: string, prefixText: string): string {
  const escaped = prefixText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`^\\s*(?:<[^>]+>)*\\s*${escaped}\\s*(?:<[^>]+>)*`, 'i');
  return html.replace(regex, '').trim();
}

/**
 * Walk a DOM tree and clean all class, style, and Microsoft-specific attributes.
 */
function cleanElementDom(el: Element) {
  // Remove junk nodes (XML tags, scripts, styles)
  const junkTags = ['o:p', 'xml', 'script', 'style', 'meta', 'link'];
  for (const tag of junkTags) {
    const junkElements = Array.from(el.getElementsByTagName(tag));
    for (const junk of junkElements) {
      junk.parentNode?.removeChild(junk);
    }
  }

  // Strip attributes for all nested nodes
  const allElements = Array.from(el.getElementsByTagName('*'));
  allElements.push(el);

  for (const node of allElements) {
    const tagName = node.tagName.toLowerCase();
    const attrs = Array.from(node.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      let allowed = false;
      if (tagName === 'img' && name === 'src') allowed = true;
      if (tagName === 'a' && name === 'href') allowed = true;
      if ((tagName === 'td' || tagName === 'th') && (name === 'colspan' || name === 'rowspan')) allowed = true;

      if (!allowed) {
        node.removeAttribute(attr.name);
      }
    }
  }
}

/**
 * Clean a single table element recursively.
 */
function cleanTableElement(table: HTMLTableElement): string {
  cleanElementDom(table);
  return table.outerHTML;
}

/**
 * Normalize semantic blocks: align lists, option continuations, and spaces.
 */
export function normalizeBlocks(blocks: SemanticBlock[]): SemanticBlock[] {
  const normalized: SemanticBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'option') {
      const label = block.label || 'A';
      const existingIdx = normalized.findIndex(b => b.type === 'option' && b.label === label);
      if (existingIdx !== -1) {
        normalized[existingIdx].content += ' ' + block.content;
      } else {
        normalized.push(block);
      }
    } else if (block.type === 'paragraph') {
      const last = normalized[normalized.length - 1];
      // Append paragraph as continuation if it follows an option and isn't a new question/option
      if (last && last.type === 'option' && !QUESTION_START_RE.test(block.content)) {
        last.content += '<br/>' + block.content;
      } else {
        normalized.push(block);
      }
    } else {
      normalized.push(block);
    }
  }

  return normalized;
}

/**
 * Parse structured blocks from raw plain text as a fallback.
 */
export function parseBlocksFromPlainText(plainText: string): SemanticBlock[] {
  const lines = plainText.split('\n').map(l => l.trimEnd());
  const blocks: SemanticBlock[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const optMatch = trimmed.match(OPTION_LINE_START);
    if (optMatch) {
      const label = (optMatch[1] || optMatch[2] || '').toUpperCase();
      const content = optMatch[3].trim();
      blocks.push({
        type: 'option',
        content,
        label,
      });
    } else if (blocks.length > 0 && blocks[blocks.length - 1].type === 'option' && !QUESTION_START_RE.test(trimmed)) {
      const last = blocks[blocks.length - 1];
      last.content += ' ' + trimmed;
    } else {
      blocks.push({
        type: 'paragraph',
        content: trimmed,
      });
    }
  }

  return normalizeBlocks(blocks);
}

/**
 * Parse Word HTML into structured semantic blocks using DOMParser.
 */
export function extractStructuredBlocks(html: string, plainText: string): SemanticBlock[] {
  if (!html?.trim()) {
    return parseBlocksFromPlainText(plainText);
  }

  try {
    // 1. Convert Math tags (OMML/MathML) inside HTML to clean LaTeX
    const htmlWithMath = convertHtmlMathToLatex(html);

    // 2. Parse into DOM tree
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlWithMath, 'text/html');
    const body = doc.body;

    const blocks: SemanticBlock[] = [];
    const children = Array.from(body.children);

    for (const child of children) {
      const tag = child.tagName.toLowerCase();

      if (tag === 'table') {
        const cleanTableHtml = cleanTableElement(child as HTMLTableElement);
        blocks.push({
          type: 'table',
          content: cleanTableHtml,
        });
        continue;
      }

      if (tag === 'ul' || tag === 'ol') {
        const lis = Array.from(child.getElementsByTagName('li'));
        for (const li of lis) {
          cleanElementDom(li);
          const liHtml = li.innerHTML.trim();
          const liText = li.textContent || '';
          
          const optMatch = liText.trim().match(OPTION_START);
          if (optMatch) {
            const label = (optMatch[1] || optMatch[2] || '').toUpperCase();
            const content = removeOptionPrefix(liHtml, optMatch[0]);
            blocks.push({
              type: 'option',
              content,
              label,
            });
          } else {
            blocks.push({
              type: 'list_item',
              content: liHtml,
            });
          }
        }
        continue;
      }

      // For p, div, heading elements
      cleanElementDom(child);
      const innerHtml = child.innerHTML.trim();
      const textContent = child.textContent || '';
      const trimmedText = textContent.trim();

      if (!trimmedText) continue;

      const optMatch = trimmedText.match(OPTION_START);
      if (optMatch) {
        const label = (optMatch[1] || optMatch[2] || '').toUpperCase();
        const content = removeOptionPrefix(innerHtml, optMatch[0]);
        blocks.push({
          type: 'option',
          content,
          label,
        });
      } else {
        blocks.push({
          type: 'paragraph',
          content: innerHtml,
        });
      }
    }

    if (blocks.length === 0 && plainText) {
      return parseBlocksFromPlainText(plainText);
    }

    return normalizeBlocks(blocks);
  } catch (err) {
    console.warn('DOM parsing failed during rich paste cleanup, falling back to plain text:', err);
    return parseBlocksFromPlainText(plainText);
  }
}

function cleanHtmlText(html: string): string {
  let txt = html.replace(/<br\s*\/?>/gi, '\n');
  txt = txt.replace(/<[^>]+>/g, ' ');
  try {
    const doc = new DOMParser().parseFromString(txt, 'text/html');
    return (doc.body.textContent || doc.body.innerText || txt).replace(/\u00a0/g, ' ').trim();
  } catch {
    return txt.replace(/\s+/g, ' ').trim();
  }
}

function tableToPlainText(tableHtml: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(tableHtml, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return '';
    const rows = Array.from(table.querySelectorAll('tr'));
    return rows
      .map(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        return cells.map(cell => cleanHtmlText(cell.innerHTML)).join('\t');
      })
      .join('\n');
  } catch {
    return cleanHtmlText(tableHtml);
  }
}

export function blocksToPlainText(blocks: SemanticBlock[]): string {
  return blocks
    .map(b => {
      if (b.type === 'table') {
        return tableToPlainText(b.content);
      }
      const text = cleanHtmlText(b.content);
      if (b.type === 'option') {
        return `(${b.label || 'A'}) ${text}`;
      }
      if (b.type === 'list_item') {
        return `* ${text}`;
      }
      return text;
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

