/**
 * LaTeX-first enrichment from mammoth HTML fragments.
 */

function decodeHtmlEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

export function htmlToPlainWithLatex(html) {
  if (!html) return { text: '', latex: null, displayLatex: null };

  let work = html;
  const displayParts = [];
  const displayRe = /<p[^>]*class="[^"]*equation[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  work = work.replace(displayRe, (_, inner) => {
    displayParts.push(stripInlineHtmlToLatex(inner));
    return `\n$$${displayParts[displayParts.length - 1]}$$\n`;
  });

  work = work
    .replace(/<sup>([^<]*)<\/sup>/gi, (_, c) => `^{${stripInlineHtmlToLatex(c)}}`)
    .replace(/<sub>([^<]*)<\/sub>/gi, (_, c) => `_{${stripInlineHtmlToLatex(c)}}`)
    .replace(/<strong>([^<]*)<\/strong>/gi, (_, c) => `\\mathbf{${stripInlineHtmlToLatex(c)}}`)
    .replace(/<em>([^<]*)<\/em>/gi, (_, c) => c)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '');

  const text = decodeHtmlEntities(work).replace(/\n{3,}/g, '\n\n').trim();
  const displayLatex = displayParts[0] || extractBlockLatex(text);
  const latex = displayLatex || extractPrimaryInlineLatex(text);

  return { text: stripLatexDelimitersForStorage(text), latex, displayLatex };
}

function stripInlineHtmlToLatex(s) {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, '').trim());
}

function stripLatexDelimitersForStorage(text) {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
    .replace(/\$([^$\n]+?)\$/g, '$1')
    .trim();
}

function extractBlockLatex(text) {
  const m = text.match(/\$\$([\s\S]+?)\$\$/);
  return m ? m[1].trim() : null;
}

function extractPrimaryInlineLatex(text) {
  if (/\$\$/.test(text)) return null;
  const m = text.match(/\$([^$\n]+?)\$/);
  return m ? m[1].trim() : null;
}

export function enrichBlockFromHtml(block, html) {
  if (!html) return block;
  const { text, latex, displayLatex } = htmlToPlainWithLatex(html);
  const mergedText = block.lines?.length ? block.lines.join('\n') : text;
  const questionLatex = displayLatex || latex || block.questionLatex || null;
  const finalText = mergedText || text;

  return {
    ...block,
    lines: finalText.split('\n').filter(Boolean),
    questionLatex,
    hasEquation: Boolean(
      questionLatex || /\$|\\frac|\\int|\\sum|\\sqrt|\\begin\{/.test(finalText)
    ),
    htmlFragment: html,
  };
}
