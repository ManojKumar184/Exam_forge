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

  const hasTags = /\[Question_start\]/i.test(html);

  // Temporarily isolate table tags to prevent splitting inside them
  const tables = [];
  const htmlPlaceholder = html.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
    const placeholder = `<!-- TABLE_PLACEHOLDER_${tables.length} -->`;
    tables.push(match);
    return placeholder;
  });

  let parts;
  if (hasTags) {
    parts = htmlPlaceholder.split(/\[Question_start\]/i);
    // Keep only parts that have a closing tag
    parts = parts.filter((p) => p.includes('[Question_end]'));
  } else {
    parts = htmlPlaceholder.split(
      /(?=<p[^>]*>\s*(?:<strong>)?\s*(?:(?:SECTION|PART)\s+[A-Z0-9]+|(?:Q(?:uestion)?\s*)?\d{1,3}[\).:\-\s]))/i
    );
  }

  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 20)
    .map((part, index) => {
      let cleanPart = part;
      if (hasTags) {
        // Strip the solution and question_end tags and everything after them
        cleanPart = cleanPart.split(/\[solution\]/i)[0].split(/\[Question_end\]/i)[0];
      }

      // Restore table content for this segment
      const restoredHtml = cleanPart.replace(/<!-- TABLE_PLACEHOLDER_(\d+) -->/gi, (_, idx) => {
        return tables[parseInt(idx, 10)];
      });

      const images = extractImagesFromHtml(restoredHtml);
      const segmentTables = extractTablesFromHtml(restoredHtml);
      const text = stripTags(restoredHtml);
      return {
        index,
        html: restoredHtml,
        text,
        images: images.map((img) => img.url),
        diagrams: [
          ...images,
          ...segmentTables.map((t) => ({ ...t, url: null })),
        ],
        hasTable: segmentTables.length > 0,
      };
    });
}

export function normalizeTextForMatching(text) {
  if (!text) return '';
  // Strip LaTeX math blocks $...$ or $$...$$
  const withoutMath = text.replace(/\$\$?[\s\S]*?\$\$?/g, '');
  return withoutMath
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Attach images from HTML segments to normalized question blocks by index or robust match.
 */
export function attachMediaToQuestions(questions, htmlSegments) {
  if (!htmlSegments?.length) return questions;

  return questions.map((q, idx) => {
    const qNorm = normalizeTextForMatching(q.questionText).slice(0, 50);
    const segment = htmlSegments.find((s) => {
      const sNorm = normalizeTextForMatching(s.text);
      return qNorm && sNorm && (sNorm.includes(qNorm) || qNorm.includes(sNorm.slice(0, 50)));
    }) || htmlSegments[idx];

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
      `(?:\\(?\\s*${letter}\\s*\\)?[\\).:]\\s*)([\\s\\S]*?)(?=(?:\\(?\\s*[A-F]\\s*\\)?[\\).:])|$)`,
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
