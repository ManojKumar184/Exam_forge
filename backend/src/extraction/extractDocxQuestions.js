import fs from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';
import { splitTextIntoBlocks, normalizeQuestions } from './normalizeQuestions.js';

export async function extractDocxQuestions(filePath, context = {}) {
  const buffer = await fs.readFile(filePath);
  const images = [];

  const result = await mammoth.convertToHtml(
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
  );

  const rawText = await mammoth.extractRawText({ buffer });
  const text = rawText.value || '';

  if (!text.trim()) {
    return {
      questions: [],
      warnings: ['DOCX contained no extractable text'],
      images,
      rawTextLength: 0,
    };
  }

  const blocks = splitTextIntoBlocks(text);
  const questions = normalizeQuestions(blocks, {
    ...context,
    extractedFrom: 'docx',
    sourceFile: path.basename(filePath),
  });

  const warnings = [];
  if (questions.length === 0) {
    warnings.push('No question blocks detected — document may need manual review');
  }

  return {
    questions,
    warnings,
    images,
    rawTextLength: text.length,
  };
}
