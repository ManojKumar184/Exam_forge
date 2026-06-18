import fs from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';
import { splitTextIntoBlocks, normalizeQuestions, preprocessDocumentText } from './normalizeQuestions.js';
import {
  splitHtmlIntoQuestionSegments,
  attachMediaToQuestions,
  mapOptionImagesFromHtml,
} from './htmlQuestionParser.js';
import {
  parseDocxXmlStructure,
  buildTextFromDocxStructure,
  alignHtmlSegmentsToBlocks,
} from './docxAdvancedParser.js';
import { enrichBlockFromHtml } from './docxMathHtml.js';
import { semanticDocumentFromDocxStructure } from './documentIntelligence/semanticDocumentModel.js';

export async function extractDocxQuestions(filePath, context = {}) {
  const buffer = await fs.readFile(filePath);
  const images = [];

  const [mammothHtml, structure] = await Promise.all([
    mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const ext = image.contentType?.split('/')[1] || 'png';
          const imageName = `docx-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const imageDir = context.imageDir || path.join(path.dirname(filePath), '..', 'images');
          await fs.mkdir(imageDir, { recursive: true });
          const imagePath = path.join(imageDir, imageName);
          await fs.writeFile(imagePath, await image.read());
          const relativePath = `/uploads/images/${imageName}`;
          images.push(relativePath);
          return { src: relativePath };
        }),
      }
    ),
    parseDocxXmlStructure(buffer).catch(() => ({ paragraphs: [], tables: [], rawText: '' })),
  ]);

  const rawTextFallback = await mammoth.extractRawText({ buffer });
  const xmlOrdered =
    structure.paragraphs?.length > 2
      ? buildTextFromDocxStructure(structure)
      : preprocessDocumentText(rawTextFallback.value || '');
  const semanticDocument = semanticDocumentFromDocxStructure(structure, {
    sourceFile: path.basename(filePath),
    imageCount: images.length,
  });

  if (!xmlOrdered.trim()) {
    return {
      questions: [],
      warnings: ['DOCX contained no extractable text'],
      images,
      rawTextLength: 0,
    };
  }

  let blocks = splitTextIntoBlocks(xmlOrdered);
  const htmlSegments = splitHtmlIntoQuestionSegments(mammothHtml.value || '');
  blocks = alignHtmlSegmentsToBlocks(blocks, htmlSegments);

  const blocksWithMedia = blocks.map((block, idx) => {
    let enriched = block;
    if (block.html) {
      enriched = enrichBlockFromHtml(block, block.html, structure.tables);
    }
    const segment = htmlSegments.find((s) => s.index === block.segmentIndex) ||
                    htmlSegments.find((s) => {
                      if (!enriched.lines?.[0]) return false;
                      const normEnriched = enriched.lines[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
                      const normS = (s.text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                      return normEnriched && normS.includes(normEnriched);
                    });
    if (segment) {
      enriched = {
        ...enriched,
        images: segment.images,
        diagrams: segment.diagrams,
        hasTable: segment.hasTable,
        options: mapOptionImagesFromHtml(segment.html, enriched.options),
      };
    }
    return enriched;
  });

  // ── Enrich semantic document blocks with images from mammoth HTML extraction ──
  // The semanticDocument from semanticDocumentFromDocxStructure does NOT carry image
  // data, but the ingestionPipeline prefers it over the legacy-blocks fallback.
  // We merge images here so the semantic document carries them through
  // detectQuestionBoundaries → segmentToLegacyBlock → normalizeQuestions.
  // ── Enhanced Image Extraction from all sources ──
  // Phase 1: Merge mammoth-extracted images into semantic document blocks
  if (semanticDocument && semanticDocument.blocks && htmlSegments.length > 0) {
    const normalizeTextForMatching = (text) => {
      if (!text) return '';
      // Strip LaTeX math blocks $...$ or $$...$$
      const withoutMath = text.replace(/\$\$?[\s\S]*?\$\$?/g, '');
      return withoutMath
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    };

    // Pass 1: Robust text matching
    for (const sdBlock of semanticDocument.blocks) {
      if (!sdBlock.text) continue;

      const txt = sdBlock.text.trim().toLowerCase();
      // Skip generic blocks to avoid false matching
      if (
        txt.startsWith('explanation') ||
        txt.startsWith('answer') ||
        txt.startsWith('option') ||
        txt.match(/^(?:[a-d]|[p-s])[\).:\-\s]/i)
      ) {
        continue;
      }

      const sdNorm = normalizeTextForMatching(sdBlock.text).slice(0, 80);
      if (sdNorm.length < 15) continue;

      const matched = htmlSegments.find(s => {
        const segNorm = normalizeTextForMatching(s.text || '');
        return segNorm && (segNorm.includes(sdNorm) || sdNorm.includes(segNorm.slice(0, 80)));
      });
      if (matched && matched.images && matched.images.length > 0) {
        const existingUrls = new Set((sdBlock.images || []).map(i => (typeof i === 'string' ? i : i.url || i)));
        for (const img of matched.images) {
          const url = typeof img === 'string' ? img : (img.url || img);
          if (url && !existingUrls.has(url)) {
            if (!sdBlock.images) sdBlock.images = [];
            sdBlock.images.push(url);
            existingUrls.add(url);
          }
        }
      }
    }

    
    // Pass 3: Scan ALL HTML for images that weren't captured by mammoth's convertImage
    // Mammoth only captures images it can convert via the convertImage callback.
    // Some embedded images (especially base64 data URIs) remain as <img> tags in the HTML.
    // We need to extract these by decoding the base64 data and saving to disk.
    const allHtmlImages = [];
    const imgTagRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgTagRegex.exec(mammothHtml.value || '')) !== null) {
      const src = imgMatch[1];
      // Only skip images ALREADY captured by mammoth's convertImage callback
      if (images.includes(src)) continue;
      if (allHtmlImages.includes(src)) continue;
      allHtmlImages.push(src);
    }
    if (allHtmlImages.length > 0) {
      // Process each image - decode base64 data URIs and save to disk
      const imageDir = context.imageDir || path.join(path.dirname(filePath), '..', 'images');
      for (const imgUrl of allHtmlImages) {
        if (images.includes(imgUrl)) continue;
        
        // Handle base64 data URIs: decode and save to disk
        if (imgUrl.startsWith('data:')) {
          try {
            const matches = imgUrl.match(/^data:image\/([a-zA-Z]+);base64,([a-zA-Z0-9+/=]+)$/);
            if (matches) {
              const ext = matches[1] === 'octet-stream' ? 'png' : matches[1];
              const imageName = `docx-img-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
              const imagePath = path.join(imageDir, imageName);
              await fs.mkdir(imageDir, { recursive: true });
              const buffer = Buffer.from(matches[2], 'base64');
              await fs.writeFile(imagePath, buffer);
              const relativePath = `/uploads/images/${imageName}`;
              images.push(relativePath);
            }
          } catch (err) {
            console.warn('[extractDocx] Failed to extract base64 image:', err.message);
          }
        } else {
          images.push(imgUrl);
        }
      }
      // Distribute remaining images to blocks that lack them
      let imgIdx = 0;
      for (const sdBlock of semanticDocument.blocks) {
        if (!sdBlock.images || sdBlock.images.length === 0) {
          if (imgIdx < allHtmlImages.length) {
            if (!sdBlock.images) sdBlock.images = [];
            sdBlock.images.push(images[images.length - allHtmlImages.length + imgIdx]);
            imgIdx++;
          }
        }
      }
    }
    // ── Back-merge semantic document images into blocksWithMedia ──
    // The semantic document enrichment above distributes images to sdBlocks,
    // but blocksWithMedia (used by uploadService when returnRawBlocks=true)
    // was constructed BEFORE the enrichment. Re-sync here.
    if (semanticDocument && semanticDocument.blocks && blocksWithMedia.length > 0) {
      for (const bwmBlock of blocksWithMedia) {
        if (!bwmBlock.lines?.[0]) continue;
        const bwmNorm = normalizeTextForMatching(bwmBlock.lines[0]);
        if (!bwmNorm) continue;
        
        const matchedSd = semanticDocument.blocks.find(sd => {
          const sdNorm = normalizeTextForMatching(sd.text || '');
          return sdNorm && (sdNorm.includes(bwmNorm) || bwmNorm.includes(sdNorm));
        });
        
        if (matchedSd && matchedSd.images && matchedSd.images.length > 0) {
          const existingUrls = new Set((bwmBlock.images || []).map(i => typeof i === 'string' ? i : i.url || i));
          const newUrls = matchedSd.images.filter(url => url && !existingUrls.has(url));
          if (newUrls.length > 0) {
            bwmBlock.images = [...(bwmBlock.images || []), ...newUrls];
          }
        }
      }
    }
  }

  // Phase 2: Extract images from table cells (table images are often missed by mammoth's convertImage)
  if (structure.tables && structure.tables.length > 0) {
    for (const table of structure.tables) {
      const tableModel = table.tableModel;
      if (!tableModel || !tableModel.rows) continue;
      for (const row of tableModel.rows) {
        for (const cell of row) {
          if (!cell) continue;
          const html = cell.html || '';
          const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
          let m;
          while ((m = imgRegex.exec(html)) !== null) {
            const src = m[1];
            if (!images.includes(src)) {
              images.push(src);
            }
          }
        }
      }
    }
  }

  if (context.returnRawBlocks) {
    const warnings = [];
    if (structure.tables?.length) {
      warnings.push(`${structure.tables.length} table(s) detected — verify table content in questions`);
    }
    return {
      blocks: blocksWithMedia,
      questions: [],
      warnings,
      images,
      semanticDocument,
      rawText: xmlOrdered,
      rawTextLength: xmlOrdered.length,
      extractionMode: structure.paragraphs?.length > 2 ? 'docx_xml+html' : 'docx_html',
    };
  }

  let questions = await normalizeQuestions(blocksWithMedia, {
    ...context,
    extractedFrom: 'docx',
    sourceFile: path.basename(filePath),
  });

  for (const q of questions) {
    const block = blocksWithMedia.find((b) => b.questionNumber && q.tags?.includes(`qnum:${b.questionNumber}`));
    if (block?.questionLatex && !q.questionLatex) {
      q.questionLatex = block.questionLatex;
      q.hasEquation = true;
    }
    q.renderingMetadata = {
      ...(q.renderingMetadata || {}),
      latexFirst: true,
      source: 'docx_advanced',
    };
  }

  questions = attachMediaToQuestions(questions, htmlSegments);

  const warnings = [];
  if (structure.tables?.length) {
    warnings.push(`${structure.tables.length} table(s) detected — verify table content in questions`);
  }
  if (questions.length === 0) {
    warnings.push('No question blocks detected — document may need manual review');
  }

  return {
    questions,
    warnings,
    images,
    semanticDocument,
    rawText: xmlOrdered,
    rawTextLength: xmlOrdered.length,
    extractionMode: structure.paragraphs?.length > 2 ? 'docx_xml+html' : 'docx_html',
  };
}
