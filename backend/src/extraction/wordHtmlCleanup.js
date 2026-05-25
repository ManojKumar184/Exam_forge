/**
 * Word / Office HTML cleanup — run BEFORE parser or Gemini.
 */
import { convertHtmlMathToLatex } from './mathConverter.js';

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
 */
export function cleanupWordHtml(html) {
  if (!html?.trim()) return { html: '', plain: '', images: [] };

  // Convert OMML and MathML to LaTeX first
  let h = convertHtmlMathToLatex(html);

  h = h.replace(/<!--\[if[\s\S]*?endif\]-->/gi, '');
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  h = h.replace(/<\?xml[\s\S]*?\?>/gi, '');
  h = h.replace(/<o:p>\s*<\/o:p>/gi, '');
  h = h.replace(/<o:p[^>]*>[\s\S]*?<\/o:p>/gi, '');
  h = h.replace(/<\/?o:[^>]+>/gi, '');
  h = h.replace(/<\/?w:[^>]+>/gi, '');
  h = h.replace(/<\/?m:[^>]+>/gi, '');
  h = h.replace(/<script[\s\S]*?<\/script>/gi, '');
  h = h.replace(/<style[\s\S]*?<\/style>/gi, '');
  h = h.replace(/\s*mso-[^:;"]+:[^;"]+;?/gi, '');
  h = h.replace(/\s*class="Mso[^"]*"/gi, '');
  h = h.replace(/\s*style="[^"]*mso[^"]*"/gi, '');

  const images = [];
  h = h.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (full, src) => {
    if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('/')) {
      images.push(src);
    }
    return full;
  });

  h = h.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_, t) => `^{${stripTags(t)}}`);
  h = h.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_, t) => `_{${stripTags(t)}}`);
  h = h.replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<\/p>/gi, '\n');
  h = h.replace(/<\/div>/gi, '\n');
  h = h.replace(/<\/tr>/gi, '\n');
  h = h.replace(/<\/li>/gi, '\n');

  const plain = cleanPlainText(stripTags(h));
  const safeHtml = h
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  return {
    html: safeHtml.trim(),
    plain,
    images: [...new Set(images)],
  };
}

export function mergePasteSources({ html, plain, ocrText }) {
  const cleaned = html ? cleanupWordHtml(html) : { html: '', plain: '', images: [] };
  const parts = [cleaned.plain, plain, ocrText].map((p) => cleanPlainText(p)).filter(Boolean);
  const mergedPlain = parts.join('\n\n').trim();
  return {
    html: cleaned.html,
    plain: mergedPlain || cleaned.plain,
    images: cleaned.images,
  };
}
