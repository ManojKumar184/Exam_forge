import { shieldMath } from './mathConverter';

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
  const junkTags = [
    'o:p', 'xml', 'script', 'style', 'meta', 'link',
    'officedocumentsettings', 'worddocument', 'latentstyles', 
    'themedata', 'colorschememapping', 'background', 'formulas',
    'path', 'stroke', 'shadow', 'fill', 'shape', 'imagedata',
    'textbox', 'oleobject', 'rect', 'line', 'oval', 'arc',
    'curve', 'polyline', 'group', 'image', 'shapetype'
  ];
  for (const tag of junkTags) {
    const junkElements = Array.from(el.getElementsByTagName(tag));
    for (const junk of junkElements) {
      junk.parentNode?.removeChild(junk);
    }
  }

  // Also remove elements starting with o:, w:, m:, v:, x: (except math)
  const allElements = Array.from(el.getElementsByTagName('*'));
  for (const node of allElements) {
    const tag = node.tagName.toLowerCase();
    if (
      tag.startsWith('o:') ||
      tag.startsWith('w:') ||
      tag.startsWith('v:') ||
      tag.startsWith('x:') ||
      (tag.startsWith('m:') && tag !== 'm:omath' && tag !== 'm:omathpara')
    ) {
      node.parentNode?.removeChild(node);
      continue;
    }
  }

  // Strip attributes for all remaining elements
  const remainingElements = Array.from(el.getElementsByTagName('*'));
  remainingElements.push(el);

  for (const node of remainingElements) {
    if (!node.parentNode && node !== el) continue;

    const tagName = node.tagName.toLowerCase();
    const attrs = Array.from(node.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      let allowed = false;
      if (tagName === 'img' && name === 'src') allowed = true;
      if (tagName === 'a' && name === 'href') allowed = true;
      if ((tagName === 'td' || tagName === 'th') && (name === 'colspan' || name === 'rowspan' || name === 'align' || name === 'valign')) allowed = true;

      if (!allowed) {
        node.removeAttribute(attr.name);
      }
    }
  }
}

/**
 * Perform structured DOM normalization passes on the body element.
 */
function normalizeBodyDom(body: HTMLElement) {
  // 1. Pass 3 & 5: List / Numbering / Option Prefix Collapsing
  // We run this first so prefix fragments can be collapsed into text nodes before empty nodes/spans are flattened.
  const prefixRegex = /^\s*(?:\(?\s*\d+\s*\)?\s*[\).:\-–—]|(?:\(?\s*[a-zA-Z]\s*\)?\s*[\).:\-–—])|(?:\(?\s*[ivxIVX]+\s*\)?\s*[\).:\-–—])|(?:\(?\s*[·•\-*▪o]\s*\)?\s*))/i;
  const allParagraphs = Array.from(body.querySelectorAll('p, div, li, td, th'));
  for (const p of allParagraphs) {
    const textContent = p.textContent || '';
    const trimmed = textContent.trim();
    
    const hasPrefix = prefixRegex.test(trimmed);
    if (hasPrefix) {
      const prefixMatch = trimmed.match(prefixRegex);
      if (prefixMatch) {
        const cleanPrefix = prefixMatch[0].replace(/\s+/g, ' ');
        const prefixLen = prefixMatch[0].length;
        let currentLen = 0;
        
        const textNodes: Text[] = [];
        const findTextNodes = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            textNodes.push(node as Text);
          } else {
            for (const child of Array.from(node.childNodes)) {
              findTextNodes(child);
            }
          }
        };
        findTextNodes(p);

        for (const node of textNodes) {
          const val = node.nodeValue || '';
          if (currentLen < prefixLen) {
            const need = prefixLen - currentLen;
            if (val.length <= need) {
              currentLen += val.length;
              node.nodeValue = '';
            } else {
              node.nodeValue = val.slice(need);
              currentLen = prefixLen;
            }
          } else {
            break;
          }
        }
        
        const prefixNode = p.ownerDocument.createTextNode(cleanPrefix);
        p.insertBefore(prefixNode, p.firstChild);
      }
    }
  }

  // 2. Pass 2: Empty Node Elimination
  const stripEmptyNodes = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      stripEmptyNodes(child);
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const isContainer = ['span', 'div', 'p', 'font', 'b', 'i', 'u', 'strong', 'em', 'sup', 'sub'].includes(tag);
      
      if (isContainer) {
        const text = (el.textContent || '').replace(/[\s\u00a0\t\r\n]+/g, ' ').trim();
        const hasSemanticChildren = el.querySelector('img, table, ol, ul, li') !== null;
        const hasMath = /MATHPLACEHOLDER/i.test(el.innerHTML) || 
                        /HTMLTAGPLACEHOLDER/i.test(el.innerHTML) ||
                        /__MATH_PLACEHOLDER_/i.test(el.innerHTML);

        if (!text && !hasSemanticChildren && !hasMath) {
          el.parentNode?.removeChild(el);
        }
      }
    }
  };
  stripEmptyNodes(body);

  // 3. Pass 1: Semantic Inline Normalization (merge adjacent text nodes and identical inline tags, flatten redundant spans)
  const normalizeInlineNodes = (el: Node) => {
    const children = Array.from(el.childNodes);
    for (const child of children) {
      normalizeInlineNodes(child);
    }

    if (el.nodeType === Node.ELEMENT_NODE) {
      const element = el as HTMLElement;
      const tag = element.tagName.toLowerCase();

      // Flatten span/font with no attributes
      if (tag === 'span' || tag === 'font') {
        if (element.attributes.length === 0) {
          const parent = element.parentNode;
          if (parent) {
            while (element.firstChild) {
              parent.insertBefore(element.firstChild, element);
            }
            parent.removeChild(element);
          }
          return;
        }
      }

      // Merge adjacent identical inline tags
      const inlineTags = ['span', 'b', 'i', 'u', 'strong', 'em', 'sup', 'sub'];
      if (inlineTags.includes(tag)) {
        const next = element.nextSibling;
        if (next && next.nodeType === Node.ELEMENT_NODE) {
          const nextEl = next as HTMLElement;
          if (nextEl.tagName.toLowerCase() === tag) {
            let attrsMatch = element.attributes.length === nextEl.attributes.length;
            if (attrsMatch) {
              for (let i = 0; i < element.attributes.length; i++) {
                const attr = element.attributes[i];
                if (nextEl.getAttribute(attr.name) !== attr.value) {
                  attrsMatch = false;
                  break;
                }
              }
            }
            if (attrsMatch) {
              while (nextEl.firstChild) {
                element.appendChild(nextEl.firstChild);
              }
              nextEl.parentNode?.removeChild(nextEl);
              normalizeInlineNodes(element);
            }
          }
        }
      }
    }
  };
  normalizeInlineNodes(body);

  // Merge remaining adjacent text nodes
  body.normalize();
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
    // 1. EARLY PRE-PARSER NORMALIZATION
    const cleanHtml = preParseNormalizeHtml(html);

    // 2. Shield raw OMML/MathML tags
    const { html: shieldedHtml, map: mathMap } = shieldMath(cleanHtml);

    // 3. Parse into DOM tree
    const parser = new DOMParser();
    const doc = parser.parseFromString(shieldedHtml, 'text/html');
    const body = doc.body;

    // Apply deterministic DOM-based normalization passes
    normalizeBodyDom(body);

    const blocks: SemanticBlock[] = [];
    const children = Array.from(body.children);

    for (const child of children) {
      const tag = child.tagName.toLowerCase();

      // Discard junk/non-semantic nodes at root level
      const junkTags = [
        'style', 'xml', 'script', 'meta', 'link', 'title', 'head',
        'officedocumentsettings', 'worddocument', 'latentstyles',
        'themedata', 'colorschememapping', 'background', 'formulas',
        'path', 'stroke', 'shadow', 'fill'
      ];
      if (
        junkTags.includes(tag) ||
        tag.startsWith('o:') ||
        tag.startsWith('w:') ||
        tag.startsWith('m:') ||
        tag.startsWith('v:') ||
        tag.startsWith('x:')
      ) {
        continue;
      }

      if (tag === 'table') {
        // Pass 5: Table-based option structure detection & normalization
        const cells = Array.from(child.querySelectorAll('td, th'));
        const optionCells = cells.filter(cell => {
          const txt = (cell.textContent || '').trim();
          return OPTION_START.test(txt);
        });
        
        if (optionCells.length >= 2) {
          // Yes, this table is used to layout options! Extract them as individual option blocks
          for (const cell of cells) {
            const txt = (cell.textContent || '').trim();
            const cellHtml = cell.innerHTML.trim();
            const optMatch = txt.match(OPTION_START);
            if (optMatch) {
              const label = (optMatch[1] || optMatch[2] || '').toUpperCase();
              const content = removeOptionPrefix(cellHtml, optMatch[0]);
              blocks.push({
                type: 'option',
                content,
                label,
              });
            }
          }
          continue;
        }

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

    // Restore math placeholders in all blocks
    const keys = Object.keys(mathMap).sort((a, b) => b.length - a.length);
    for (const block of blocks) {
      for (const key of keys) {
        if (block.content.includes(key)) {
          block.content = block.content.split(key).join(mathMap[key]);
        }
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

/**
 * Deterministically isolate semantic body content and strip all document-level noise,
 * conditional comments, VML graphics, and Office metadata BEFORE parsing begins.
 */
export function preParseNormalizeHtml(html: string): string {
  if (!html) return '';

  let out = html;

  // 1. Isolate <body> inner content if it exists
  const bodyMatch = out.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    out = bodyMatch[1];
  } else {
    // If no body exists, strip html/head/meta/style tags if present
    out = out
      .replace(/<html[^>]*>/gi, '')
      .replace(/<\/html>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<meta[^>]*>/gi, '')
      .replace(/<link[^>]*>/gi, '');
  }

  // 2. Remove conditional comments completely if they are fallback branches
  // Handles: <!--[if !msEquation]--> ... <![endif]--> AND <![if !msEquation]> ... <![endif]>
  out = out.replace(/(?:<!--)?<!\[if !msEquation\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  out = out.replace(/(?:<!--)?<!\[if gte vml[\s\S]*?\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  out = out.replace(/(?:<!--)?<!\[if gte mso[\s\S]*?\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');

  // 3. Remove conditional comment tags but preserve their inner contents for supportLists/other logic
  out = out.replace(/(?:<!--)?<!\[if[^\]]*\]>(?:-->)?/gi, '');
  out = out.replace(/(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');

  // 4. Remove all standard HTML comments
  out = out.replace(/<!--[\s\S]*?-->/g, '');

  // 5. Remove VML shape/graphics nodes and tags completely (both start/end tags and content)
  const vmlTags = [
    'shape', 'imagedata', 'stroke', 'path', 'formulas', 'f', 'handles', 'textbox', 'shadow',
    'lock', 'oleobject', 'rect', 'line', 'oval', 'arc', 'curve', 'polyline', 'group', 'image',
    'shapetype'
  ];
  for (const tag of vmlTags) {
    out = out.replace(new RegExp(`<(?:v|o):${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:v|o):${tag}>`, 'gi'), '');
    out = out.replace(new RegExp(`<(?:v|o):${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  // 6. Strip any other namespaced tags from w:, o:, v:, x: namespace, preserving contents
  // Crucial: we do NOT touch m: (Office Math)
  out = out.replace(/<\/?(?:w|o|v|x):[^>]*>/gi, '');

  // 7. Strip Office XML/metadata attributes and CSS styles
  out = out.replace(/behavior\s*:\s*url\([^)]*\);?/gi, '');
  out = out.replace(/mso-[^:;"]+:[^;"]+;?/gi, '');
  out = out.replace(/\s*class="Mso[^"]*"/gi, '');
  out = out.replace(/\s*class='Mso[^']*'/gi, '');
  out = out.replace(/\s*style="[^"]*mso[^"]*"/gi, '');
  out = out.replace(/\s*style='[^']*mso[^']*'/gi, '');

  // 8. Clean up any empty paragraphs, divs, or spans recursively (up to 3 levels)
  for (let i = 0; i < 3; i++) {
    out = out.replace(/<span[^>]*>\s*<\/span>/gi, '');
    out = out.replace(/<p[^>]*>\s*<\/p>/gi, '');
    out = out.replace(/<div[^>]*>\s*<\/div>/gi, '');
  }

  // 9. Normalize multiple spaces
  out = out.replace(/[ \t]{2,}/g, ' ');

  return out.trim();
}

