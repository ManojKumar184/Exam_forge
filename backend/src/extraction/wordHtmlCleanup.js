/**
 * Word / Office HTML cleanup — run BEFORE parser or Gemini.
 */
import { convertHtmlMathToLatex, shieldMath } from './mathConverter.js';

export function detectVmlEquationImages(html) {
  if (!html) return false;
  return (
    /<v:shape\b/i.test(html) ||
    /<v:imagedata\b/i.test(html) ||
    /o:OLEObject/i.test(html) ||
    /clip_image\d+\.png/i.test(html) ||
    /clip_image\d+/i.test(html)
  );
}

const OFFICE_PLAIN_NOISE = [
  /Normal\s+0\s+false\s+false\s+false\s+[A-Z\-]+/gi,
  /false\s+false\s+false\s+EN-US\s+JH\s+K[0-9]+/gi,
  /false\s+false\s+false\s+EN-US/gi,
  /\bNormal\s+0\b/gi,
  /^\s*[\u00a0\f\v]+\s*$/gm,
  /\bMsoNormal\b/gi,
  /\bCalibri\b;\s*/gi,
];

const UNICODE_MATH_MAP = {
  '∩': '\\cap ',
  '∪': '\\cup ',
  '∣': '|',
  '×': '\\times ',
  '÷': '\\div ',
  '±': '\\pm ',
  '∞': '\\infty ',
  '∫': '\\int ',
  '∑': '\\sum ',
  '√': '\\sqrt',
  '²': '^2',
  '³': '^3',
  '⁰': '^0',
  '¹': '^1',
};

export function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function cleanPlainText(text) {
  if (!text) return '';
  let out = decodeHtmlEntities(text);
  for (const re of OFFICE_PLAIN_NOISE) {
    out = out.replace(re, ' ');
  }
  out = out
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  for (const [ch, latex] of Object.entries(UNICODE_MATH_MAP)) {
    if (out.includes(ch)) out = out.split(ch).join(latex);
  }
  return out;
}

function stripTags(html) {
  if (!html) return '';
  let text = html;

  // Format tables
  text = text.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, rowContent) => {
    const cells = [];
    const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    }
    return cells.length ? '\n' + cells.join(' | ') + '\n' : '';
  });

  // Format list items
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, liContent) => {
    return '\n * ' + liContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + '\n';
  });

  // Replace other tags with spaces
  text = text.replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(text);
}

/**
 * Strip Office markup while preserving structure (p, table, img, sup, sub).
 * Implementing the Word Nuclear Cleaner.
 */
export function cleanupWordHtml(html) {
  if (!html?.trim()) return { html: '', plain: '', images: [] };

  // 1. Isolate <body> content first
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let h = bodyMatch ? bodyMatch[1] : html;

  // 2. Convert OMML/MathML tags to LaTeX
  h = convertHtmlMathToLatex(h);

  // 3. Word Non-Destructive Clean: Unwrap conditional comments to expose OLE/VML contents
  h = h.replace(/<!--\[if[^\]]*\]>\s*<xml>/gi, '<xml>');
  h = h.replace(/<\/xml>\s*<!\[endif\]-->/gi, '</xml>');
  h = h.replace(/<!--\[if[^\]]*\]>/gi, '');
  h = h.replace(/<!\[endif\]-->/gi, '');
  h = h.replace(/<!\[if[^\]]*\]>/gi, '');
  h = h.replace(/<!\[endif\]>/gi, '');
  h = h.replace(/<!--[\s\S]*?-->/g, '');

  // Strip style blocks
  h = h.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Strip link/meta tags
  h = h.replace(/<link[^>]*>/gi, '');
  h = h.replace(/<meta[^>]*>/gi, '');

  // Strip Office placeholders
  h = h.replace(/<o:p>[\s\S]*?<\/o:p>/gi, '');

  // Strip triple dollar garbage
  h = h.replace(/\$\$\$/g, '');

  // Preserve VML elements and leftover namespace tags for reconstructionPipeline.js to process!
  // We do NOT strip vmlTags or namespaced tags here.

  // Capture real images
  const images = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(h)) !== null) {
    const src = imgMatch[1];
    if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('/')) {
      images.push(src);
    }
  }

  // Strip attributes and non-allowed tags except for namespaced/vml/math ones
  h = h.replace(/<([a-zA-Z0-9_:]+)(?:\s+[^>]*?)>/g, (match, tag) => {
    const lowerTag = tag.toLowerCase();
    
    // If it's a namespaced tag or VML/Office tag, preserve it fully
    if (lowerTag.includes(':') || ['shape', 'imagedata', 'stroke', 'path', 'formulas', 'f', 'handles', 'textbox', 'shadow', 'lock', 'oleobject', 'rect', 'line', 'oval', 'arc', 'curve', 'polyline', 'group', 'image', 'shapetype', 'xml'].includes(lowerTag)) {
      return match;
    }
    
    const allowedTags = ['p', 'span', 'b', 'i', 'u', 'strong', 'em', 'sup', 'sub', 'table', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'br', 'img', 'a', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    if (!allowedTags.includes(lowerTag)) {
      return ''; // Strip non-allowed tags
    }
    
    let attrs = '';
    if (lowerTag === 'img') {
      const srcMatch = match.match(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i);
      const altMatch = match.match(/\balt\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i);
      const shapesMatch = match.match(/\bv:shapes\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i) || match.match(/\bshapes\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i);
      if (srcMatch) attrs += ' ' + srcMatch[0];
      if (altMatch) attrs += ' ' + altMatch[0];
      if (shapesMatch) attrs += ' ' + shapesMatch[0];
    } else if (lowerTag === 'a') {
      const hrefMatch = match.match(/\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i);
      if (hrefMatch) attrs += ' ' + hrefMatch[0];
    } else if (lowerTag === 'td' || lowerTag === 'th') {
      const colspan = match.match(/\bcolspan\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i);
      const rowspan = match.match(/\browspan\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i);
      if (colspan) attrs += ' ' + colspan[0];
      if (rowspan) attrs += ' ' + rowspan[0];
    }
    return `<${lowerTag}${attrs}>`;
  });

  // Convert paragraph structures
  h = h.replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<\/p>/gi, '\n');
  h = h.replace(/<\/div>/gi, '\n');
  h = h.replace(/<\/tr>/gi, '\n');
  h = h.replace(/<\/li>/gi, '\n');

  const plain = cleanPlainText(stripTags(h));

  return {
    html: h.trim(),
    plain,
    images: [...new Set(images)],
  };
}

export function mergePasteSources(input) {
  const cleaned = input.html ? cleanupWordHtml(input.html) : { html: '', plain: '', images: [] };
  const parts = [cleaned.plain, input.plain, input.ocrText]
    .filter((p) => p && p.trim().length > 0)
    .map((p) => p.trim());

  return {
    html: cleaned.html || '',
    plain: parts.length > 0 ? parts[0] : '', // Prioritize HTML text to avoid duplicates
    images: cleaned.images || [],
  };
}
