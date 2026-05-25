/**
 * Map DOCX HTML segments to question blocks (images, tables, inline math).
 */

function decodeHtmlEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractImagesFromHtml(html) {
  const images = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    images.push({
      url: match[1],
      order: images.length,
      type: 'diagram',
    });
  }
  return images;
}

function extractTablesFromHtml(html) {
  const tables = [];
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  let match;
  while ((match = tableRegex.exec(html)) !== null) {
    tables.push({
      html: match[0],
      order: tables.length,
      type: 'table',
    });
  }
  return tables;
}

/**
 * Split mammoth HTML into segments aligned with text question blocks.
 */
export function splitHtmlIntoQuestionSegments(html) {
  if (!html?.trim()) return [];

  const parts = html.split(
    /(?=<p[^>]*>\s*(?:<strong>)?\s*(?:Q(?:uestion)?\s*)?\d{1,3}[\).:\-\s])/i
  );

  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 20)
    .map((part, index) => {
      const images = extractImagesFromHtml(part);
      const tables = extractTablesFromHtml(part);
      const text = stripTags(part);
      return {
        index,
        html: part,
        text,
        images: images.map((img) => img.url),
        diagrams: [
          ...images,
          ...tables.map((t) => ({ ...t, url: null })),
        ],
        hasTable: tables.length > 0,
      };
    });
}

/**
 * Attach images from HTML segments to normalized question blocks by index.
 */
export function attachMediaToQuestions(questions, htmlSegments) {
  if (!htmlSegments?.length) return questions;

  return questions.map((q, idx) => {
    const segment = htmlSegments[idx] || htmlSegments.find((s) => s.text && q.questionText.includes(s.text.slice(0, 40)));
    if (!segment) return q;

    const questionImages = [...(q.questionImages || []), ...(segment.images || [])];
    const diagrams = [...(q.diagrams || []), ...(segment.diagrams || [])];

    return {
      ...q,
      questionImages: [...new Set(questionImages)],
      diagrams,
      hasDiagram: questionImages.length > 0 || diagrams.length > 0,
      hasTable: segment.hasTable || q.hasTable,
      questionText: q.questionText || segment.text,
    };
  });
}

/**
 * Parse option-level images from HTML fragment (e.g. option line with img).
 */
export function mapOptionImagesFromHtml(html, options) {
  if (!html || !options?.length) return options;

  return options.map((opt, idx) => {
    const letter = String.fromCharCode(65 + idx);
    const optPattern = new RegExp(
      `(?:\\(?\\s*${letter}\\s*\\)?[\\).:]\\s*)([\\s\\S]*?)(?=(?:\\(?\\s*[A-D]\\s*\\)?[\\).:])|$)`,
      'i'
    );
    const match = html.match(optPattern);
    if (!match) return opt;

    const fragment = match[1];
    const imgs = extractImagesFromHtml(fragment);
    if (!imgs.length) return opt;

    return {
      ...opt,
      image: imgs[0].url,
      text: stripTags(fragment) || opt.text,
    };
  });
}
