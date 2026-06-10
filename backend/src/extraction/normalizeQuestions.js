import { computeDuplicateHash } from '../utils/duplicateHash.js';
import { preprocessDocumentText } from './columnReadingOrder.js';
import { detectSectionHeader } from './sectionParser.js';
import { isOptionLine, parseOptionLine, appendOptionContinuation, hasMcqOptionPattern, extractOptionsReverse } from './optionParser.js';
import { runStagesReconstruction } from './reconstructionPipeline.js';
import { detectAnswer, detectAnswerInLine } from './answerDetector.js';
import { detectExplanation } from './explanationDetector.js';
import { normalizeQuestionType } from '../utils/questionTypeNormalizer.js';

const QUESTION_START_RE = /^Q(\d{1,3})[\.\)]\s*/i;

/** Extract full bracket value from date patterns like [Jan. 24, 2023 (I)], [Adv. 2024], [April 2, 2025 (I)], [JEE Main 2023] */
const BRACKET_YEAR_RE = /\[[^\]]*?\b(?:19|20)\d{2}\b[^\]]*\]/i;

function extractBracketYear(text) {
  if (!text) return null;
  const m = text.match(BRACKET_YEAR_RE);
  return m ? m[0] : null;
}

function stripQuestionPrefix(line) {
  return line.replace(/^Q\d{1,3}[\.\)]\s*/i, '').trim();
}

function isQuestionStart(line) {
  return QUESTION_START_RE.test(line.trim());
}

function extractQuestionNumber(line) {
  const m = line.trim().match(QUESTION_START_RE);
  if (!m) return null;
  return Number(m[1]) || null;
}

export function splitTextIntoBlocks(rawText) {
  if (!rawText?.trim()) return [];

  const hasTags = /\[Question_start\]/i.test(rawText);
  if (hasTags) {
    const blocks = [];
    const ordered = preprocessDocumentText(rawText);
    const lines = ordered
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trimEnd());

    let currentSection = 'General';
    let currentBlock = null;
    let isParsingQuestion = false;
    let isParsingSolution = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed && !isParsingQuestion && !isParsingSolution) continue;

      const tagMatch = trimmed.match(/^\[([a-zA-Z0-9_-]+)(?::\s*([^\]]*))?\]$/);
      if (tagMatch) {
        const tagKey = tagMatch[1].toLowerCase();
        const tagValue = tagMatch[2] ? tagMatch[2].trim() : null;

        if (tagKey === 'question_start') {
          currentBlock = {
            questionLines: [],
            solutionLines: [],
            metadata: {},
            section: currentSection,
            options: [],
            lines: [],
            explanation: '',
            questionNumber: null,
            tags: [],
          };
          isParsingQuestion = true;
          isParsingSolution = false;
          continue;
        }

        if (tagKey === 'solution') {
          isParsingQuestion = false;
          isParsingSolution = true;
          continue;
        }

        if (tagKey === 'question_end') {
          if (currentBlock) {
            // Process block questions and options
            const qLines = [];
            for (const qLine of currentBlock.questionLines) {
              const qLineTrimmed = qLine.trim();
              if (!qLineTrimmed) continue;

              if (isOptionLine(qLineTrimmed) && !hasMcqOptionPattern(qLineTrimmed)) {
                const opt = parseOptionLine(qLineTrimmed);
                if (opt) {
                  currentBlock.options.push({ text: opt.text, label: opt.label, image: null, latex: null });
                }
              } else if (currentBlock.options.length > 0) {
                const merged = appendOptionContinuation(currentBlock.options, qLineTrimmed);
                currentBlock.options = merged.map((o) => ({
                  text: o.text,
                  label: o.label || null,
                  image: o.image ?? null,
                  latex: o.latex ?? null,
                }));
              } else {
                qLines.push(qLine);
              }
            }

            // Extract question number from first line
            if (qLines.length > 0) {
              const firstLine = qLines[0];
              const qNum = extractQuestionNumber(firstLine);
              if (qNum) {
                currentBlock.questionNumber = qNum;
                qLines[0] = stripQuestionPrefix(firstLine);
              }
            }

            currentBlock.lines = qLines;
            const solutionText = currentBlock.solutionLines.join('\n').trim();

            // Use answer detector to find structured answer in solution lines
            const ansResult = detectAnswer(solutionText);
            if (ansResult.confidence > 0.5) {
              currentBlock.answerKey = ansResult.answerText;
              currentBlock.correctOption = ansResult.correctOption;
              currentBlock.correctAnswers = ansResult.correctAnswers;
              currentBlock.numericalAnswer = ansResult.numericalAnswer;
            }

            // Use explanation detector to extract explanation separately from answer
            const expResult = detectExplanation(solutionText);
            if (expResult.explanation) {
              currentBlock.explanation = expResult.explanation;
            } else {
              currentBlock.explanation = solutionText;
            }

            // Extensible Tag Mapping
            if (currentBlock.metadata.type) {
              currentBlock.questionType = currentBlock.metadata.type.toLowerCase();
              currentBlock.tags.push(currentBlock.metadata.type.toLowerCase());
            }
            if (currentBlock.metadata.class) {
              currentBlock.class = Number(currentBlock.metadata.class) || undefined;
              currentBlock.tags.push(`class:${currentBlock.metadata.class}`);
            }
            if (currentBlock.metadata.difficulty) {
              currentBlock.difficulty = currentBlock.metadata.difficulty.toLowerCase();
              currentBlock.tags.push(`difficulty:${currentBlock.metadata.difficulty}`);
            }
            if (currentBlock.metadata.subject) {
              currentBlock.tags.push(`subject:${currentBlock.metadata.subject}`);
            }
            if (currentBlock.metadata.chapter) {
              currentBlock.tags.push(`chapter:${currentBlock.metadata.chapter}`);
            }
            // Preserve all extra metadata tags in tags array
            for (const [k, v] of Object.entries(currentBlock.metadata)) {
              if (!['type', 'class', 'difficulty', 'subject', 'chapter'].includes(k)) {
                currentBlock.tags.push(v ? `${k}:${v}` : k);
              }
            }

            blocks.push(currentBlock);
          }
          currentBlock = null;
          isParsingQuestion = false;
          isParsingSolution = false;
          continue;
        }

        // Generic metadata tag [key:value] or [key]
        if (currentBlock) {
          currentBlock.metadata[tagKey] = tagValue;
        }
        continue;
      }

      if (currentBlock) {
        if (isParsingQuestion) {
          currentBlock.questionLines.push(line);
        } else if (isParsingSolution) {
          currentBlock.solutionLines.push(line);
        }
      } else {
        const sectionHeader = detectSectionHeader(trimmed);
        if (sectionHeader) {
          currentSection = sectionHeader.name;
        } else if (/^(topic|part|section|class|chapter)\b/i.test(trimmed) || (trimmed.length > 0 && trimmed.length < 80)) {
          currentSection = trimmed;
        }
      }
    }
    return blocks;
  }

  // Strict template-based split logic.
  // Question detection driven ONLY by the template structure: Q<number>)
  const ordered = preprocessDocumentText(rawText);
  const lines = ordered
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd());

  const blocks = [];
  let currentLines = [];
  let currentSection = 'General';
  let inTable = false;

  const flushBlock = () => {
    if (currentLines.length === 0) return;
    
    const { stem, options, confidence, trailingText, answerLine, explanationLine } = extractOptionsReverse(currentLines);
    
    // Determine question number using ONLY Q<number>) format
    let qNum = null;
    const firstLine = currentLines[0]?.trim() || '';
    const qNumMatch = firstLine.match(/^Q(\d{1,3})[\.\)]\s*/i);
    if (qNumMatch) {
      qNum = parseInt(qNumMatch[1], 10);
    }
    // No debug code

    const stemLines = stem.split('\n');
    if (qNum && stemLines.length > 0) {
      for (let i = 0; i < stemLines.length; i++) {
        if (stemLines[i].trim()) {
          stemLines[i] = stemLines[i].replace(/^Q\d{1,3}[\.\)]\s*/i, '').trim();
          break;
        }
      }
    }

    // Extract answer and explanation from trailing text using new detectors
    let blockAnswerKey = null;
    let blockCorrectOption = undefined;
    let blockCorrectAnswers = [];
    let blockNumericalAnswer = undefined;
    let blockExplanation = '';

    if (trailingText) {
      // Use answer detector on full trailing text + dedicated lines
      const ansResult = detectAnswer(trailingText);
      if (ansResult.confidence > 0.5) {
        blockAnswerKey = ansResult.answerText;
        blockCorrectOption = ansResult.correctOption;
        blockCorrectAnswers = ansResult.correctAnswers;
        blockNumericalAnswer = ansResult.numericalAnswer;
      }

      // Use explanation detector on trailing text
      const expResult = detectExplanation(trailingText);
      if (expResult.explanation) {
        blockExplanation = expResult.explanation;
      } else {
        // Fallback: use entire trailing text as explanation if it's substantial
        const cleanTrailing = trailingText
          .replace(/^(?:Answer|Ans|Correct\s+Answer|Correct\s+Option)\s*[:：]\s*(.+)/gi, '')
          .replace(/^(?:Explanation|Solution|Reason|Detailed\s+Solution|Sol)\s*[:：]/gi, '')
          .trim();
        if (cleanTrailing.length > 20) {
          blockExplanation = cleanTrailing;
        }
      }
    }

    const hasTableBlock = currentLines.some(l => l.trim() === '[TABLE_START]');

    blocks.push({
      lines: stemLines,
      options,
      questionNumber: qNum,
      section: currentSection,
      parserConfidence: confidence,
      hasTable: hasTableBlock,
      answerKey: blockAnswerKey,
      correctOption: blockCorrectOption,
      correctAnswers: blockCorrectAnswers,
      numericalAnswer: blockNumericalAnswer,
      explanation: blockExplanation,
      tags: qNum ? [`qnum:${qNum}`] : []
    });

    currentLines = [];
  };

  let prevLine = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === '[TABLE_START]') {
      inTable = true;
    } else if (trimmed === '[TABLE_END]') {
      inTable = false;
    }

    // Section headers: flush current block and update section, but NEVER become questions
    const sectionHeader = detectSectionHeader(trimmed);
    if (sectionHeader) {
      flushBlock();
      currentSection = sectionHeader.name;
      prevLine = '';
      continue;
    }

    // Strict question boundary: ONLY Q<number>) triggers a new block
    if (!inTable && isQuestionStart(trimmed) && currentLines.length > 0) {
      flushBlock();
    }

    currentLines.push(line);
    prevLine = line;
  }
  flushBlock();
  return blocks;
}

/**
 * Post-processing: Merge answer/explanation blocks and filter headers.
 *
 * Physics_cleaned_dataset.docx has a flat structure where Answer:/Explanation:
 * lines following a question are treated as separate blocks by the DOM splitter.
 * This function merges them back into their preceding question block and removes
 * standalone header blocks (Topic, Part, Section titles).
 */
function mergeAnswerExplanationBlocks(blocks) {
  const merged = [];
  // Track section-aware question number offset.
  // Part A uses Q1-Q28 (offset 0). Part B restarts at Q1 (offset +28 → Q29+).
  let sectionOffset = 0;
  let partACount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const text = (block.lines || []).join('\n').trim();
    const firstLine = (text.split('\n')[0] || '').trim();

    // ── Filter: Part / Topic / Section headers ──
    if (/^part\s+[a-z]/i.test(firstLine) ||
        /^topic\s+\d/i.test(firstLine) ||
        /^\d+\)\s*(?:multiple choice|numeric)/i.test(firstLine) ||
        /^\d+\s+MCQs?\b/i.test(firstLine)) {
      // Preserve section name on the most recent merged block
      if (merged.length > 0 && !merged[merged.length - 1].section) {
        merged[merged.length - 1].section = firstLine;
      }
      continue;
    }

    // ── Detect: Standalone answer / explanation block ──
    const isAnswerBlock = /^(?:Answer|Ans|Correct\s+Answer|Correct\s+Option)\s*[:：]/i.test(firstLine);
    const isExplanationBlock = /^(?:Explanation|Solution|Reason|Detailed\s+Solution|Sol)\s*[:：]/i.test(firstLine);

    if ((isAnswerBlock || isExplanationBlock) && merged.length > 0) {
      const prev = merged[merged.length - 1];

      // Append the answer/explanation lines to the preceding block's lines
      // This lets extractOptionsReverse see them as trailing boundary content
      if (block.lines && block.lines.length > 0) {
        prev.lines = [...(prev.lines || []), ...block.lines];
      }

      // Also set answer/explanation fields directly from detectors
      if (isAnswerBlock) {
        const ansResult = detectAnswer(text);
        if (ansResult.confidence > 0.5) {
          prev.answerKey = ansResult.answerText;
          prev.correctOption = ansResult.correctOption;
          prev.correctAnswers = ansResult.correctAnswers;
          prev.numericalAnswer = ansResult.numericalAnswer;
        }
      }

      const expResult = detectExplanation(text);
      if (expResult.explanation) {
        prev.explanation = expResult.explanation;
      }

      continue;
    }

    // ── Regular block: keep (with deduplication) ──
    // Check if this block has very similar content to the previous block
    // (can happen when XML structure and HTML alignment both produce the same question)
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      // Normalize: collapse whitespace, strip LaTeX math delimiters, strip Q-prefix
      const normalize = (t) => t
        .replace(/\$[^$]+?\$/g, '')
        .replace(/\\\([\s\S]+?\\\)/g, '')
        .replace(/\\\[[\s\S]+?\\\]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,\.;:\)])/g, '$1')  // normalize space-before-punctuation from LaTeX stripping
        .replace(/^Q(?:uestion)?\s*\d{1,3}\s*[\.\)]\s*/i, '')
        .trim()
        .slice(0, 80);

      const prevNorm = normalize((prev.lines || []).join(''));
      const currNorm = normalize((block.lines || []).join(''));

      if (prevNorm.length > 20 && currNorm.length > 20 &&
          prevNorm === currNorm) {
        // Duplicate — merge metadata from the richer copy
        if ((block.options?.length || 0) > (prev.options?.length || 0)) {
          prev.options = block.options;
        }
        if (block.questionNumber && !prev.questionNumber) {
          prev.questionNumber = block.questionNumber;
          // Apply section offset to the merged questionNumber
          // (the offset check ran before we had a questionNumber)
          if (sectionOffset > 0) {
            prev.questionNumber = prev.questionNumber + sectionOffset;
            prev.tags = (prev.tags || [])
              .filter(t => !t.startsWith('qnum:'))
              .concat(`qnum:${prev.questionNumber}`);
          } else {
            // Copy qnum tag from the richer copy
            const qnumTag = (block.tags || []).find(t => t.startsWith('qnum:'));
            if (qnumTag && !(prev.tags || []).some(t => t.startsWith('qnum:'))) {
              prev.tags = [...(prev.tags || []), qnumTag];
            }
          }
        }
        if ((block.lines?.length || 0) > (prev.lines?.length || 0)) {
          prev.lines = block.lines;
        }
        continue;
      }
    }

    // Section-aware question number offset
    // Part A uses Q1-Q28 (offset 0). Part B restarts at Q1, creating overlap.
    // Detect Part B transition by observing a Q-number restart:
    // when a block has a much SMALLER Q-number than the previously seen max,
    // it's a section boundary (e.g., Q28 → Q1 means Part B starts).
    if (block.questionNumber && sectionOffset === 0) {
      if (block.questionNumber > partACount) {
        partACount = block.questionNumber;
      } else if (partACount > 10 && block.questionNumber <= 5) {
        // Q-number dropped significantly (e.g., Q28 → Q1) = section restart
        sectionOffset = partACount;
      }
    }

    // Apply offset to Part B question numbers
    if (sectionOffset > 0 && block.questionNumber) {
      block.questionNumber = block.questionNumber + sectionOffset;
      // Update the qnum tag too
      block.tags = (block.tags || [])
        .filter(t => !t.startsWith('qnum:'))
        .concat(`qnum:${block.questionNumber}`);
    }

    merged.push({ ...block });
  }

  return merged;
}

export async function normalizeQuestions(rawBlocks, context = {}) {
  // Phase 0: Merge answer/explanation blocks and filter headers
  const mergedBlocks = mergeAnswerExplanationBlocks(rawBlocks);

  const normalized = [];

  for (let idx = 0; idx < mergedBlocks.length; idx++) {
    const block = mergedBlocks[idx];
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
        {
          ...context,
          tables: block.renderingMetadata?.tables || []
        }
      );

      let questionType = normalizeQuestionType(pipeline.questionType);
      const finalQuestionText = pipeline.stem.replace(/^Q\d{1,3}[\.\)]\s*/i, '').trim();
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
          ...(block.questionNumber ? [`qnum:${block.questionNumber}`] : []),
          ...(block.tags || [])
        ])
      ].filter(Boolean);

      const warnings = [...(block.extractionWarnings || []), ...pipeline.warnings];

      let correctOption = block.correctOption !== undefined ? block.correctOption : null;
      let answerText = block.answerKey || null;
      let numericalAnswer = block.numericalAnswer !== undefined ? block.numericalAnswer : null;

      // Parse raw answerKey (e.g., "Answer: A" → correctOption=0, "Answer: 101" → numericalAnswer=101)
      // This handles blocks from the boundary detector where answerKey is set as raw text
      // but correctOption/numericalAnswer are not extracted.
      if (answerText && correctOption === null && numericalAnswer === null) {
        const ansResult = detectAnswer(answerText);
        if (ansResult.confidence > 0.5) {
          correctOption = ansResult.correctOption;
          numericalAnswer = ansResult.numericalAnswer;
          answerText = ansResult.answerText;
        }
      }

      // Prefer pre-extracted answer from merge/detectors (higher confidence)
      if (!answerText) {
        // Fallback: regex match in the final stem
        const answerMatch = finalQuestionText.match(
          /(?:answer|ans|correct)\s*[:\-]?\s*\(?([a-fA-F])\)?/i
        );
        if (answerMatch) {
          correctOption = answerMatch[1].toUpperCase().charCodeAt(0) - 65;
          answerText = answerMatch[1].toUpperCase();
        }
      }

      // If we have correctAnswers from block merge but no answerText, derive from that
      if (!answerText && block.correctAnswers && block.correctAnswers.length > 0) {
        answerText = block.correctAnswers.map(i => String.fromCharCode(65 + i)).join(',');
      }

      const hasMalformedOrUnresolved = (pipeline.unresolvedMath && pipeline.unresolvedMath.length > 0) || 
                                       (pipeline.warnings && pipeline.warnings.some(w => /unresolved|malformed|failed to restore/i.test(w)));
      
      const lowConfidence = (pipeline.confidence < 0.70) ||
                            (pipeline.reconstructionFidelity < 0.70) ||
                            (pipeline.semanticConfidence < 0.70) ||
                            (pipeline.mathPreservationConfidence < 0.70) ||
                            (pipeline.metadataConfidence < 0.70);

      const status = (warnings.length > 0 || lowConfidence || hasMalformedOrUnresolved) ? 'needs_review' : 'pending';

      const base = {
        questionText: finalQuestionText,
        questionType,
        questionLatex: block.questionLatex || (pipeline.questionType !== 'MCQ_SINGLE' && pipeline.questionType !== 'MCQ_MULTIPLE' ? (finalQuestionText.match(/\$([^$]+?)\$/) || [])[1] || null : null),
        options: finalOptions,
        correctOption,
        answerText,
        answerKey: answerText,
        numericalAnswer,
        class: block.class || context.class || 11,
        difficulty: block.difficulty || context.difficulty || 'medium',
        marks: null, // Detached marks during ingestion
        explanation: block.explanation || pipeline.explanation || null,
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
          tables: block.renderingMetadata?.tables || pipeline.tables || [],
        },
        
        // Year extracted from question text — full bracket preserved (e.g. [April 8, 2025 (II)])
        year: extractBracketYear(questionText) || extractBracketYear(pipeline.stem) || null,

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
