import { isOptionLine, parseOptionLine, splitInlineOptionsInLine } from '../optionParser.js';
import { detectSectionHeader } from '../sectionParser.js';

const QUESTION_LABEL_RE = /^(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[\).:\-\]]\s*|^\(\s*(\d{1,4})\s*\)\s*/i;
const ANSWER_RE = /^(?:answer|ans|correct\s+option|key)\s*[:\-]/i;
const EXPLANATION_RE = /^(?:solution|explanation|detailed\s+solution|soln|reason)\s*[:\-]/i;
const PASSAGE_RE = /(?:comprehension|passage|read\s+the\s+following)/i;

export function detectQuestionBoundaries(semanticDocument) {
  const segments = [];
  let current = null;
  let passageBlocks = [];
  let activeSection = 'General';
  let activeSectionContext = null;

  const flush = () => {
    if (!current) return;
    current.confidence = scoreBoundary(current);
    segments.push(current);
    current = null;
  };

  for (const block of semanticDocument.blocks || []) {
    const text = block.text?.trim() || '';
    if (!text && block.type !== 'image') continue;

    // Detect section block
    const isSectionHeader = block.roleHints?.includes('section') || block.style === 'section';
    if (isSectionHeader) {
      flush();
      activeSection = text;
      const sectionHeader = detectSectionHeader(text);
      const isMultiCorrectSection = /(?:one\s+or\s+more|multiple|more\s+than\s+one)\s+correct/i.test(text) ||
                                    (sectionHeader && sectionHeader.examPart === 'mcq_multiple');
      if (isMultiCorrectSection) {
        activeSectionContext = { questionType: 'MCQ_MULTIPLE' };
      } else {
        activeSectionContext = null;
      }
      continue;
    }

    const role = detectBlockRole(block);
    if (role === 'passage' && !current) {
      passageBlocks.push(block);
      continue;
    }

    if (role === 'question_start') {
      flush();
      current = {
        id: `qseg-${segments.length + 1}`,
        questionNumber: extractQuestionNumber(text),
        passageBlocks: [...passageBlocks],
        stemBlocks: [block],
        optionBlocks: [],
        answerBlocks: [],
        explanationBlocks: [],
        mediaBlocks: [],
        confidenceSignals: ['explicit_question_anchor'],
        section: activeSection,
        sectionContext: activeSectionContext,
      };
      passageBlocks = [];
      continue;
    }

    if (!current) {
      current = {
        id: `qseg-${segments.length + 1}`,
        questionNumber: null,
        passageBlocks: [...passageBlocks],
        stemBlocks: [],
        optionBlocks: [],
        answerBlocks: [],
        explanationBlocks: [],
        mediaBlocks: [],
        confidenceSignals: ['implicit_first_question'],
        section: activeSection,
        sectionContext: activeSectionContext,
      };
      passageBlocks = [];
    }

    if (role === 'answer') {
      current.answerBlocks.push(block);
      const split = splitAnswerAndExplanation(block);
      if (split.explanation) {
        current.explanationBlocks.push({ ...block, text: split.explanation, roleHints: ['explanation'] });
      }
    }
    else if (role === 'explanation') current.explanationBlocks.push(block);
    else if (role === 'option') current.optionBlocks.push(block);
    else if (block.type === 'image') current.mediaBlocks.push(block);
    else if (block.type === 'table' && current.optionBlocks.length) current.optionBlocks.push(block);
    else if (current.explanationBlocks.length) current.explanationBlocks.push(block);
    else current.stemBlocks.push(block);
  }

  flush();
  return segments.filter((segment) => segment.stemBlocks.length || segment.optionBlocks.length);
}

function detectBlockRole(block) {
  const text = block.text?.trim() || '';
  if (block.roleHints?.includes('passage') || PASSAGE_RE.test(text)) return 'passage';
  if (block.roleHints?.includes('explanation') || EXPLANATION_RE.test(text)) return 'explanation';
  if (ANSWER_RE.test(text)) return 'answer';
  if (block.roleHints?.includes('option') || isOptionLine(text)) return 'option';
  if (block.numbering?.ilvl && Number(block.numbering.ilvl) > 0 && isOptionLine(text)) return 'option';
  if (QUESTION_LABEL_RE.test(text) || block.numbering?.ilvl === '0' || block.style?.toLowerCase()?.includes('question')) {
    return 'question_start';
  }
  return 'stem';
}

function extractQuestionNumber(text) {
  const match = text.match(QUESTION_LABEL_RE);
  return match ? Number(match[1] || match[2]) || null : null;
}

function scoreBoundary(segment) {
  let score = 0.55;
  if (segment.questionNumber) score += 0.2;
  if (segment.optionBlocks.length) score += 0.1;
  if (segment.answerBlocks.length) score += 0.07;
  if (segment.confidenceSignals.includes('explicit_question_anchor')) score += 0.08;
  return Math.min(0.98, score);
}

function splitAnswerAndExplanation(block) {
  const text = block.text || '';
  const match = text.match(/(?:solution|explanation|detailed\s+solution|soln|reason)\s*[:\-]?\s*(.+)$/i);
  return { explanation: match?.[1]?.trim() || null };
}

export function segmentToLegacyBlock(segment) {
  const optionBlocks = segment.optionBlocks || [];
  return {
    segmentId: segment.id,
    lines: segment.stemBlocks.map((block) => block.text).filter(Boolean),
    passage: segment.passageBlocks.map((block) => block.text).filter(Boolean).join('\n\n') || null,
    options: optionBlocks.flatMap((block, index) => {
      const text = block.text || '';
      // First, try splitting inline options when multiple exist in one block
      const inline = splitInlineOptionsInLine(text);
      if (inline && inline.options && inline.options.length >= 2) {
        return inline.options.map(o => ({
          label: o.label.toUpperCase(),
          text: o.text,
          image: block.images?.[0] || null,
          latex: block.equations?.[0]?.value || null,
        }));
      }
      // Fall back to single-option parsing
      const parsed = parseOptionLine(text);
      return [{
        label: (parsed?.label || block.raw?.label || String.fromCharCode(65 + index)).toUpperCase(),
        text: parsed?.text || text,
        image: block.images?.[0] || null,
        latex: block.equations?.[0]?.value || null,
      }];
    }),
    explanation: segment.explanationBlocks.map((block) => block.text.replace(EXPLANATION_RE, '').trim()).filter(Boolean).join('\n\n'),
    answerKey: segment.answerBlocks.map((block) => block.text).join('\n'),
    questionNumber: segment.questionNumber,
    section: segment.section || segment.stemBlocks[0]?.section || 'General',
    sectionContext: segment.sectionContext || null,
    images: [...segment.mediaBlocks.flatMap((block) => block.images || []), ...segment.stemBlocks.flatMap((block) => block.images || [])],
    hasTable: [...segment.stemBlocks, ...segment.optionBlocks].some((block) => block.type === 'table' || block.table),
    renderingMetadata: {
      tables: [...segment.stemBlocks, ...segment.optionBlocks].map((block) => block.table).filter(Boolean),
      boundaryConfidence: segment.confidence,
    },
    parserConfidence: segment.confidence,
    tags: [
      ...(segment.questionNumber ? [`qnum:${segment.questionNumber}`] : []),
      ...(segment.sectionContext?.questionType ? [`typeOverride:${segment.sectionContext.questionType}`] : []),
    ],
  };
}
