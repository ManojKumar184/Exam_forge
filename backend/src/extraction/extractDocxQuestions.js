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
      enriched = enrichBlockFromHtml(block, block.html);
    }
    const segment = htmlSegments[idx] || htmlSegments.find((s) => enriched.lines?.[0] && s.text?.includes(enriched.lines[0].slice(0, 40)));
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

  let questions = normalizeQuestions(blocksWithMedia, {
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
    rawText: xmlOrdered,
    rawTextLength: xmlOrdered.length,
    extractionMode: structure.paragraphs?.length > 2 ? 'docx_xml+html' : 'docx_html',
  };
}
