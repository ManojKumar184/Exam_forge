import { computeDuplicateHash } from '../utils/duplicateHash.js';
import { preprocessDocumentText } from './columnReadingOrder.js';
import { detectSectionHeader } from './sectionParser.js';
import { isOptionLine, parseOptionLine, appendOptionContinuation } from './optionParser.js';
import { runStagesReconstruction } from './reconstructionPipeline.js';

const QUESTION_START_RE =
  /^(?:Q(?:uestion)?\s*)?(\d{1,3})[\).:\-\s]+|^\((\d{1,3})\)\s+|^(\d{1,3})\.\s+(?=[A-Za-z(\\$])/i;

function stripQuestionPrefix(line) {
  return line
    .replace(/^(?:Q(?:uestion)?\s*)?\d{1,3}[\).:\-\s]+/i, '')
    .replace(/^\(\d{1,3}\)\s+/, '')
    .trim();
}

function isQuestionStart(line) {
  return QUESTION_START_RE.test(line.trim());
}

function extractQuestionNumber(line) {
  const m = line.trim().match(QUESTION_START_RE);
  if (!m) return null;
  return Number(m[1] || m[2] || m[3]) || null;
}

export function splitTextIntoBlocks(rawText) {
  if (!rawText?.trim()) return [];

  const ordered = preprocessDocumentText(rawText);
  const lines = ordered
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd());

  const blocks = [];
  let current = { lines: [], options: [], questionNumber: null, section: 'General' };
  let passageLines = [];
  let inComprehensionPassage = false;

  const flush = () => {
    if (current.lines.length > 0 || current.options.length > 0) {
      if (passageLines.length > 0 && inComprehensionPassage) {
        current.passage = passageLines.join('\n').trim();
        current.tags = [...(current.tags || []), 'comprehension'];
      }
      blocks.push({ ...current });
    }
    current = { lines: [], options: [], questionNumber: null, section: current.section, tags: [] };
    passageLines = [];
    inComprehensionPassage = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    const sectionHeader = detectSectionHeader(trimmed);
    if (sectionHeader) {
      flush();
      current.section = sectionHeader.name;
      inComprehensionPassage = /comprehension|passage/i.test(sectionHeader.name);
      continue;
    }

    if (isOptionLine(trimmed)) {
      const opt = parseOptionLine(trimmed);
      if (opt) {
        inComprehensionPassage = false;
        current.options.push({ text: opt.text, label: opt.label, image: null, latex: null });
        continue;
      }
    }

    if (
      inComprehensionPassage &&
      !isQuestionStart(trimmed) &&
      current.lines.length === 0 &&
      current.options.length === 0
    ) {
      passageLines.push(trimmed);
      continue;
    }

    if (isQuestionStart(trimmed) && (current.lines.length > 0 || current.options.length > 0)) {
      flush();
      current.questionNumber = extractQuestionNumber(trimmed);
      current.lines.push(stripQuestionPrefix(trimmed));
      inComprehensionPassage = false;
      continue;
    }

    if (current.options.length > 0 && !isQuestionStart(trimmed) && !isOptionLine(trimmed)) {
      const merged = appendOptionContinuation(current.options, trimmed);
      if (merged !== current.options) {
        current.options = merged.map((o) => ({
          text: o.text,
          label: o.label || null,
          image: o.image ?? null,
          latex: o.latex ?? null,
        }));
        continue;
      }
    }

    if (isQuestionStart(trimmed)) {
      current.questionNumber = extractQuestionNumber(trimmed);
      current.lines.push(stripQuestionPrefix(trimmed));
    } else {
      current.lines.push(trimmed);
    }
  }

  if (current.lines.length > 0 || current.options.length > 0) blocks.push(current);
  return blocks;
}

export async function normalizeQuestions(rawBlocks, context = {}) {
  const normalized = [];

  for (let idx = 0; idx < rawBlocks.length; idx++) {
    const block = rawBlocks[idx];
    try {
      let questionText = block.lines.join('\n').trim();
      if (block.passage) {
        questionText = `${block.passage}\n\n${questionText}`.trim();
      }
      if (!questionText || questionText.length < 5) continue;

      // Update progress callback if available
      if (context.onStageChange) {
        await context.onStageChange(
          'reconstructing',
          40 + Math.round((idx / rawBlocks.length) * 30),
          `Reconstructing question ${idx + 1}/${rawBlocks.length}`
        );
      }

      // Build the list of SemanticBlock structures (stem + parsed options)
      const blocksList = [];
      if (block.passage) {
        blocksList.push({ type: 'passage', content: block.passage });
      }
      blocksList.push({ type: 'text', content: block.lines.join('\n').trim() });
      if (block.options && block.options.length > 0) {
        block.options.forEach((opt, idx) => {
          const label = opt.label || ['A', 'B', 'C', 'D'][idx] || String.fromCharCode(65 + idx);
          blocksList.push({ type: 'option', label: label.toUpperCase(), content: opt.text });
        });
      }

      // Use our state-of-the-art 13-stage pipeline to reconstruct!
      const pipeline = await runStagesReconstruction(
        questionText,
        block.html || null,
        null,
        blocksList,
        block.html || null,
        context
      );

      const questionType = pipeline.questionType;
      const finalQuestionText = pipeline.stem;
      const finalOptions = pipeline.options.map(o => ({
        text: o.text || '',
        latex: o.latex || null,
        image: o.image || null,
      }));

      const tags = [
        ...new Set([
          pipeline.subtype,
          ...(block.section ? [`section:${block.section}`] : []),
          ...(block.passage ? ['comprehension'] : []),
          ...(block.questionNumber ? [`qnum:${block.questionNumber}`] : [])
        ])
      ];

      const warnings = [...(block.extractionWarnings || []), ...pipeline.warnings];

      let correctOption = null;
      let answerText = block.answerKey || null;

      const answerMatch = finalQuestionText.match(
        /(?:answer|ans|correct)\s*[:\-]?\s*\(?([a-dA-D])\)?/i
      );
      if (answerMatch) {
        correctOption = answerMatch[1].toUpperCase().charCodeAt(0) - 65;
        answerText = answerMatch[1].toUpperCase();
      }

      const status =
        warnings.length > 0 ? 'needs_review' : 'pending';

      const base = {
        questionText: finalQuestionText,
        questionType,
        questionLatex: block.questionLatex || (pipeline.questionType !== 'mcq' ? (finalQuestionText.match(/\$([^$]+?)\$/) || [])[1] || null : null),
        options: finalOptions,
        correctOption,
        answerText,
        answerKey: answerText,
        class: context.class || 11,
        difficulty: context.difficulty || 'medium',
        marks: null, // Detached marks during ingestion
        status,
        tags,
        extractionWarnings: warnings,
        duplicateHash: computeDuplicateHash(finalQuestionText),
        questionImages: block.images || [],
        diagrams: block.diagrams || [],
        hasDiagram: Boolean(block.images?.length || block.diagrams?.length),
        hasTable: Boolean(block.hasTable),
        source: context.source || 'upload',
        sourceFile: context.sourceFile || null,
        extractedFrom: context.extractedFrom || null,
        renderingMetadata: {
          section: block.section || null,
          questionNumber: block.questionNumber || null,
          subtype: pipeline.subtype || null,
        },
        
        // SaaS semantic fields
        correctAnswers: pipeline.correctAnswers || [],
        figures: pipeline.figures || [],
        formulas: pipeline.formulas || [],
        semanticBlocks: pipeline.semanticBlocks || [],
        statementGroups: pipeline.statementGroups || [],
        comprehensionLinks: pipeline.comprehensionLinks || [],
        parserConfidence: pipeline.confidence || 0.8,
        reconstructionFidelity: pipeline.reconstructionFidelity || 0.8,
        semanticConfidence: pipeline.semanticConfidence || 1.0,
        mathPreservationConfidence: pipeline.mathPreservationConfidence || 1.0,
        metadataConfidence: pipeline.metadataConfidence || 1.0,
      };

      if (base.questionLatex) {
        base.hasEquation = true;
      }
      if (base.questionImages?.length) {
        base.imageMetadata = base.questionImages.map((url, order) => ({
          url,
          order,
          caption: null,
          type: 'diagram',
        }));
      }
      normalized.push(base);
    } catch (err) {
      console.error("Failed to normalize question block:", err);
      // Fail gracefully and continue processing other blocks
    }
  }

  return normalized;
}

export { preprocessDocumentText } from './columnReadingOrder.js';
