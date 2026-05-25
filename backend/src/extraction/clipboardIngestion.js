import { convertHtmlMathToLatex } from './mathConverter.js';

const OPTION_START = /^\s*(?:\(?\s*([a-dA-D])\s*\)?\s*[\).:\-–—]\s*|([a-dA-D])\s*[\).:\-–—]\s+)/i;
const OPTION_LINE_START = /^\s*(?:\(?\s*([a-dA-D])\s*\)?\s*[\).:\-–—]\s*|([a-dA-D])\s*[\).:\-–—]\s+)(.+)$/i;

const QUESTION_START_RE =
  /^(?:Q(?:uestion)?\s*)?(\d{1,3})[\).:\-\s]+|^\((\d{1,3})\)\s+|^(\d{1,3})\.\s+(?=[A-Za-z(\\$])/i;

/**
 * Remove option prefixes like "(A)" or "A." from the clean HTML string.
 */
function removeOptionPrefix(html, prefixText) {
  const escaped = prefixText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`^\\s*(?:<[^>]+>)*\\s*${escaped}\\s*(?:<[^>]+>)*`, 'i');
  return html.replace(regex, '').trim();
}

/**
 * Strip XML/Mso noise and clean HTML tags.
 */
function cleanHtmlSnippet(html) {
  if (!html) return '';
  let out = html
    .replace(/<!--\[if[\s\S]*?endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<o:p>\s*<\/o:p>/gi, '')
    .replace(/<o:p[^>]*>[\s\S]*?<\/o:p>/gi, '')
    .replace(/<\/?o:[^>]+>/gi, '')
    .replace(/<\/?w:[^>]+>/gi, '')
    .replace(/<\/?m:[^>]+>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\s*(?:class|style|id|lang|onclick|onload|onerror|onmouseover|mso-[^=]+)\s*=\s*"[^"]*"/gi, '')
    .replace(/\s*(?:class|style|id|lang|onclick|onload|onerror|onmouseover|mso-[^=]+)\s*=\s*'[^']*'/gi, '');

  return out.trim();
}

/**
 * Extract clean inner text from HTML snippet.
 */
function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u00a0/g, ' ')
    .trim();
}

/**
 * Normalize semantic blocks: align lists, option continuations, and spaces.
 */
export function normalizeBlocks(blocks) {
  const normalized = [];

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
export function parseBlocksFromPlainText(plainText) {
  const lines = plainText.split('\n').map(l => l.trimEnd());
  const blocks = [];

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
 * Parse HTML into structured semantic blocks using RegExp fallback.
 */
export function extractStructuredBlocks(html, plainText) {
  if (!html?.trim()) {
    return parseBlocksFromPlainText(plainText);
  }

  try {
    // 1. Convert Math tags (OMML/MathML) inside HTML to clean LaTeX
    const htmlWithMath = convertHtmlMathToLatex(html);

    // 2. Clean Office/Style noise
    const cleanHtml = cleanHtmlSnippet(htmlWithMath);

    // 3. Extract tables, lists, and paragraphs sequentially using regex tokenization
    const blocks = [];
    const blockRegex = /<(table|ul|ol|p|div|h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    let lastIndex = 0;

    const handleTextChunk = (text) => {
      const trimmedText = text.replace(/<[^>]+>/g, '').trim();
      if (!trimmedText) return;
      const lines = text.split(/<br\s*\/?>|<\/p>|<\/div>/i);
      for (const line of lines) {
        const t = line.replace(/<[^>]+>/g, '').trim();
        if (!t) continue;
        const optMatch = t.match(OPTION_START);
        if (optMatch) {
          const label = (optMatch[1] || optMatch[2] || '').toUpperCase();
          const content = removeOptionPrefix(line.trim(), optMatch[0]);
          blocks.push({
            type: 'option',
            content: cleanHtmlSnippet(content),
            label,
          });
        } else {
          blocks.push({
            type: 'paragraph',
            content: cleanHtmlSnippet(line.trim()),
          });
        }
      }
    };

    while ((match = blockRegex.exec(cleanHtml)) !== null) {
      const prefix = cleanHtml.slice(lastIndex, match.index).trim();
      if (prefix) {
        handleTextChunk(prefix);
      }

      const tag = match[1].toLowerCase();
      const content = match[2].trim();

      if (tag === 'table') {
        blocks.push({
          type: 'table',
          content: `<table border="1">${cleanHtmlSnippet(content)}</table>`,
        });
      } else if (tag === 'ul' || tag === 'ol') {
        const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let liMatch;
        while ((liMatch = liRegex.exec(content)) !== null) {
          const liContent = liMatch[1].trim();
          const liText = htmlToText(liContent);
          const optMatch = liText.match(OPTION_START);
          if (optMatch) {
            const label = (optMatch[1] || optMatch[2] || '').toUpperCase();
            const optionContent = removeOptionPrefix(liContent, optMatch[0]);
            blocks.push({
              type: 'option',
              content: cleanHtmlSnippet(optionContent),
              label,
            });
          } else {
            blocks.push({
              type: 'list_item',
              content: cleanHtmlSnippet(liContent),
            });
          }
        }
      } else {
        // paragraph/heading
        const textVal = htmlToText(content);
        const optMatch = textVal.match(OPTION_START);
        if (optMatch) {
          const label = (optMatch[1] || optMatch[2] || '').toUpperCase();
          const optionContent = removeOptionPrefix(content, optMatch[0]);
          blocks.push({
            type: 'option',
            content: cleanHtmlSnippet(optionContent),
            label,
          });
        } else {
          blocks.push({
            type: 'paragraph',
            content: cleanHtmlSnippet(content),
          });
        }
      }

      lastIndex = blockRegex.lastIndex;
    }

    const suffix = cleanHtml.slice(lastIndex).trim();
    if (suffix) {
      handleTextChunk(suffix);
    }

    if (blocks.length === 0 && plainText) {
      return parseBlocksFromPlainText(plainText);
    }

    return normalizeBlocks(blocks);
  } catch (err) {
    console.warn('Backend blocks parsing failed, falling back to plain text:', err);
    return parseBlocksFromPlainText(plainText);
  }
}

function cleanHtmlText(html) {
  let txt = html.replace(/<br\s*\/?>/gi, '\n');
  txt = txt.replace(/<[^>]+>/g, ' ');
  return htmlToText(txt);
}

function tableToPlainText(tableHtml) {
  try {
    const rows = [];
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(tableHtml)) !== null) {
      const rowContent = trMatch[1];
      const cells = [];
      const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        cells.push(cleanHtmlText(cellMatch[1]));
      }
      rows.push(cells.join('\t'));
    }
    return rows.join('\n');
  } catch {
    return cleanHtmlText(tableHtml);
  }
}

export function blocksToPlainText(blocks) {
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
