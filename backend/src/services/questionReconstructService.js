import { env } from '../config/env.js';
import { splitTextIntoBlocks, preprocessDocumentText } from '../extraction/normalizeQuestions.js';
import { recognizeImage } from '../ocr/tesseractOcr.js';
import { geminiReconstructCleanup } from '../ai/geminiReconstructCleanup.js';
import { mergePasteSources, cleanPlainText } from '../extraction/wordHtmlCleanup.js';
import { extractMcqOptionsInline } from '../extraction/mcqOptionExtract.js';
import { enrichOptionWithLatex } from '../extraction/latexUtils.js';
import { detectQuestionType } from '../extraction/detectQuestionType.js';

function dataUrlToBuffer(dataUrl) {
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid image data URL');
  return Buffer.from(m[2], 'base64');
}

function pickBestBlock(blocks) {
  if (!blocks?.length) return null;
  if (blocks.length === 1) return blocks[0];
  return blocks.reduce((best, b) => {
    const score = (b.lines || []).join('').length + (b.options?.length || 0) * 80;
    const bestScore = (best.lines || []).join('').length + (best.options?.length || 0) * 80;
    return score > bestScore ? b : best;
  });
}

function mergeGemini(parserRow, gemini) {
  if (!gemini) return parserRow;
  const merged = { ...parserRow };
  if (gemini.questionText?.trim()) merged.questionText = gemini.questionText.trim();
  if (gemini.questionLatex) merged.questionLatex = gemini.questionLatex;
  if (gemini.questionType) merged.questionType = gemini.questionType;
  if (Array.isArray(gemini.options) && gemini.options.length >= 2) {
    merged.options = gemini.options.map((o) => ({
      text: o.text || '',
      latex: o.latex || null,
      image: o.image || null,
    }));
  }
  if (gemini.subtype) {
    merged.renderingMetadata = {
      ...(merged.renderingMetadata || {}),
      subtype: gemini.subtype,
    };
    merged.tags = [...new Set([...(merged.tags || []), gemini.subtype, ...(gemini.tags || [])])];
  }
  if (gemini.numericalAnswer != null && gemini.numericalAnswer !== '') {
    merged.numericalAnswer = Number(gemini.numericalAnswer);
  }
  return merged;
}

function resolveSubtype(row) {
  const fromMeta = row.renderingMetadata?.subtype;
  if (fromMeta) {
    if (fromMeta === 'integer' || fromMeta === 'integer_type') return 'integer';
    if (fromMeta === 'mcq_incomplete') return 'mcq_single';
    return fromMeta;
  }
  const tag = row.tags?.find((t) =>
    ['mcq_single', 'mcq_multiple', 'integer_type', 'integer', 'match_following', 'comprehension', 'numerical'].includes(t)
  );
  if (tag === 'integer_type') return 'integer';
  if (tag === 'numerical') return 'numerical';
  return tag || 'descriptive';
}

function buildFromCleanedPlain(cleanedPlain, cleanedHtml) {
  const ordered = preprocessDocumentText(cleanedPlain);
  const blocks = splitTextIntoBlocks(ordered);
  const target = pickBestBlock(blocks);

  let stem = cleanedPlain;
  let options = [];

  if (target?.lines?.length || target?.options?.length) {
    stem = target.passage
      ? `${target.passage}\n\n${target.lines.join('\n')}`.trim()
      : target.lines.join('\n').trim();
    if (target.options?.length >= 2) {
      options = target.options;
    }
  }

  const inline = extractMcqOptionsInline(stem);
  if (inline.options.length >= 2) {
    stem = inline.stem || stem;
    options = inline.options;
  }

  const block = { lines: stem.split('\n'), options, tags: target?.tags || [] };
  const typeResult = detectQuestionType(block);

  const row = {
    questionText: stem,
    questionType: typeResult.questionType,
    options: options.map(enrichOptionWithLatex),
    tags: typeResult.tags || [],
    renderingMetadata: { subtype: typeResult.subtype },
    extractionWarnings: [],
  };

  return { row, cleanedHtml };
}

function toEditorPayload(row, cleanedHtml, imageUrls, sources, extraWarnings = []) {
  const subtype = resolveSubtype(row);

  return {
    questionText: row.questionText || '',
    questionHtml: cleanedHtml && cleanedHtml.length > 10 ? cleanedHtml : null,
    questionLatex: row.questionLatex || null,
    questionType: row.questionType || 'descriptive',
    subtype,
    options: (row.options || []).map((o) => ({
      text: o.text || '',
      latex: o.latex || null,
      image: o.image || null,
    })),
    tags: row.tags || [],
    questionImages: imageUrls || row.questionImages || [],
    numericalAnswer: row.numericalAnswer ?? null,
    correctOption: row.correctOption ?? null,
    warnings: [...(row.extractionWarnings || []), ...extraWarnings],
    sources,
    hasEquation: Boolean(row.hasEquation || row.questionLatex),
  };
}

export async function reconstructQuestionInput(body) {
  const { html, plain, ocrText, images = [], useGemini = true } = body;
  const sources = { parser: true, ocr: false, gemini: false };
  const warnings = [];

  const cleaned = mergePasteSources({ html, plain, ocrText });
  const imageUrls = [...new Set([...(images || []), ...cleaned.images])].slice(0, 6);

  let mergedPlain = cleaned.plain;

  if (env.ocr.enabled && imageUrls.length) {
    for (const img of imageUrls) {
      if (!String(img).startsWith('data:')) continue;
      try {
        const ocr = await recognizeImage(dataUrlToBuffer(img));
        if (ocr.text?.trim()) {
          mergedPlain = `${mergedPlain}\n\n${cleanPlainText(ocr.text)}`.trim();
          sources.ocr = true;
          if (ocr.warnings?.length) warnings.push(...ocr.warnings);
        }
      } catch (err) {
        warnings.push(`Image OCR failed: ${err.message}`);
      }
    }
  }

  if (!mergedPlain?.trim()) {
    return {
      questionText: '',
      questionHtml: cleaned.html || null,
      questionType: 'descriptive',
      subtype: 'descriptive',
      options: [],
      tags: [],
      questionImages: imageUrls,
      warnings: ['No text to reconstruct'],
      sources,
    };
  }

  const { row, cleanedHtml } = buildFromCleanedPlain(mergedPlain, cleaned.html);

  if (useGemini !== false && env.ai.geminiApiKey) {
    const cleanedForGemini = mergedPlain.slice(0, 4000);
    const refined = await geminiReconstructCleanup(row, cleanedForGemini);
    if (refined) {
      const merged = mergeGemini(row, refined);
      Object.assign(row, merged);
      sources.gemini = true;
    }
  }

  return toEditorPayload(row, cleanedHtml, imageUrls, sources, warnings);
}
