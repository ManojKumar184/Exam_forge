import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Card, Alert, Badge, Textarea } from '../ui';
import { LatexToolbar } from './LatexToolbar';
import { RichQuestionEditor } from './RichQuestionEditor';
import { ReconstructionPreview } from './ReconstructionPreview';
import { OptionRichFields } from './OptionRichFields';
import type { CanonicalQuestionContent, ContentBlock, Question, QuestionOption, QuestionType } from '../../types';
import { detectVmlEquationImages, type EditorSubtype } from '../../utils/questionPasteDetect';
import {
  runQuestionReconstruction,
  type ReconstructResult,
} from '../../utils/questionReconstruct';
import { autoWrapEquations, extractPrimaryLatex } from '../../utils/equationAutoWrap';
import type { SemanticBlock } from '../../utils/clipboardIngestion';
import { fetchSyllabusTree, type SyllabusNode } from '../../api/syllabus';
import { fetchQuestionBanksApi, type QuestionBank } from '../../api/questionBanks';

const DRAFT_KEY = 'examforge_question_draft';

function findPathInTree(nodes: SyllabusNode[], targetId: string, currentPath: string[] = []): string[] | null {
  for (const node of nodes) {
    const path = [...currentPath, node._id];
    if (node._id === targetId) {
      return path;
    }
    if (node.children && node.children.length > 0) {
      const found = findPathInTree(node.children, targetId, path);
      if (found) return found;
    }
  }
  return null;
}

interface QuestionEditorFormProps {
  initial?: Partial<Question>;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

const SUBTYPE_OPTIONS: { value: EditorSubtype; label: string; questionType: QuestionType }[] = [
  { value: 'mcq_single', label: 'MCQ (Single)', questionType: 'MCQ_SINGLE' },
  { value: 'mcq_multiple', label: 'MCQ (Multiple)', questionType: 'MCQ_MULTIPLE' },
  { value: 'true_false', label: 'True / False', questionType: 'TRUE_FALSE' },
  { value: 'fill_blank', label: 'Fill in the Blank', questionType: 'FILL_BLANK' },
  { value: 'assertion_reason', label: 'Assertion / Reason', questionType: 'ASSERTION_REASON' },
  { value: 'unclassified', label: 'Unclassified (needs review)', questionType: 'UNCLASSIFIED' },
  { value: 'integer', label: 'Integer', questionType: 'NUMERICAL_INTEGER' },
  { value: 'numerical', label: 'Numerical', questionType: 'NUMERICAL' },
  { value: 'match_following', label: 'Match Columns', questionType: 'MATCH_FOLLOWING' },
];

function defaultOptions(): QuestionOption[] {
  return [
    { text: '', latex: undefined },
    { text: '', latex: undefined },
    { text: '', latex: undefined },
    { text: '', latex: undefined },
  ];
}

function stemToEditorHtml(text: string): string {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return safe
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => `<p>${l.trim()}</p>`)
    .join('');
}

function parseAnswerToNumber(ans: any): number | null {
  if (ans === null || ans === undefined) return null;
  const s = String(ans).trim().toUpperCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    return parseInt(s, 10);
  }
  if (s.length === 1 && s >= 'A' && s <= 'Z') {
    return s.charCodeAt(0) - 65;
  }
  return null;
}

function applyReconstructResult(
  result: ReconstructResult,
  setters: {
    setBodyHtml: (v: string) => void;
    setBodyPlain: (v: string) => void;
    setQuestionLatex: (v: string) => void;
    setQuestionImages: (v: string[]) => void;
    setContentBlocks: (v: ContentBlock[]) => void;
    setOptions: (v: QuestionOption[]) => void;
    setSubtype: (v: EditorSubtype) => void;
    setNumericalAnswer: (v: string) => void;
    setCorrectOption: (v: number | null) => void;
    setTagsInput: (fn: (prev: string) => string) => void;
  }
) {
  const plain = result.questionText.trim();
  const officeGarbage = /Normal\s+0\s+false/i.test(result.questionHtml || '');
  const displayHtml =
    result.questionHtml?.trim() && !officeGarbage
      ? result.questionHtml
      : stemToEditorHtml(plain);
  setters.setBodyHtml(displayHtml);
  setters.setBodyPlain(plain);
  setters.setQuestionLatex(result.questionLatex || '');
  if (result.questionImages.length) setters.setQuestionImages(result.questionImages);
  setters.setContentBlocks([
    ...(plain ? [{ type: 'text' as const, text: plain }] : []),
    ...(result.questionLatex ? [{ type: 'equation' as const, latex: result.questionLatex }] : []),
    ...result.questionImages.map((assetUrl) => ({ type: 'image' as const, assetUrl })),
  ]);
  
  const mappedOptions = result.options.map(o => ({
    text: o.text,
    latex: o.latex ?? undefined,
    image: o.image ?? undefined
  }));

  if (mappedOptions.length >= 2) {
    setters.setOptions(mappedOptions);
  } else if (mappedOptions.length) {
    setters.setOptions([
      ...mappedOptions,
      ...defaultOptions().slice(mappedOptions.length),
    ]);
  }
  
  setters.setSubtype(SUBTYPE_OPTIONS.some((option) => option.value === result.subtype) ? result.subtype : 'unclassified');
  if (result.numericalAnswer != null) {
    setters.setNumericalAnswer(String(result.numericalAnswer));
  }
  if (result.correctOption != null) setters.setCorrectOption(result.correctOption);
  setters.setTagsInput((prev) => {
    const existing = prev.split(',').map((t) => t.trim()).filter(Boolean);
    return [...new Set([...result.tags, ...existing])].join(', ');
  });
}

function getSubtypeFromQuestion(q: Partial<Question> | undefined): EditorSubtype {
  if (!q) return 'mcq_single';
  const tagSub = q.tags?.find((t) => SUBTYPE_OPTIONS.some((o) => o.value === t)) as EditorSubtype | undefined;
  if (tagSub) return tagSub;

  const type = q.question_type;
  if (!type) return 'mcq_single';

  const upper = type.toUpperCase().trim();
  if (upper === 'MCQ_MULTIPLE' || upper === 'MCQ_MULTI') return 'mcq_multiple';
  if (upper === 'MCQ_SINGLE' || upper === 'MCQ') return 'mcq_single';
  if (upper === 'TRUE_FALSE') return 'true_false';
  if (upper === 'FILL_BLANK') return 'fill_blank';
  if (upper === 'ASSERTION_REASON') return 'assertion_reason';
  if (upper === 'UNCLASSIFIED') return 'unclassified';
  if (upper === 'NUMERICAL_INTEGER' || upper === 'INTEGER') return 'integer';
  if (upper === 'NUMERICAL') return 'numerical';
  if (upper === 'MATCH_FOLLOWING' || upper === 'MATCH_COLUMNS') return 'match_following';
  if (upper === 'COMPREHENSION' || upper === 'DESCRIPTIVE' || upper === 'SHORT_ANSWER' || upper === 'LONG_ANSWER') return 'unclassified';
  return 'unclassified';
}

function hasOptionContent(option: QuestionOption) {
  return Boolean(option.text?.trim() || option.image || option.latex || option.contentBlocks?.length);
}

function canonicalOptionBlocks(option: QuestionOption): ContentBlock[] {
  const blocks = structuredClone(option.contentBlocks || []);
  const text = option.text || '';
  const textBlocks = blocks.filter((block) => block.type === 'text');
  const projectedText = textBlocks.map((block) => block.text || '').join('');
  if (projectedText !== text) {
    const firstText = blocks.findIndex((block) => block.type === 'text');
    if (firstText >= 0) blocks[firstText] = { ...blocks[firstText], text };
    else if (text) blocks.unshift({ type: 'text', text });
  }
  if (option.latex) {
    const equation = blocks.findIndex((block) => block.type === 'equation');
    if (equation >= 0) blocks[equation] = { ...blocks[equation], latex: option.latex };
    else blocks.push({ type: 'equation', latex: option.latex });
  }
  if (option.image) {
    const image = blocks.findIndex((block) => block.type === 'image');
    if (image >= 0) blocks[image] = { ...blocks[image], assetUrl: option.image };
    else blocks.push({ type: 'image', assetUrl: option.image });
  }
  if (!blocks.length) {
    if (text) blocks.push({ type: 'text', text });
    if (option.latex) blocks.push({ type: 'equation', latex: option.latex });
    if (option.image) blocks.push({ type: 'image', assetUrl: option.image });
  }
  return blocks;
}

function canonicalExplanationBlocks(existing: ContentBlock[] | undefined, text: string): ContentBlock[] {
  const blocks = structuredClone(existing || []);
  const existingText = blocks.filter((block) => block.type === 'text').map((block) => block.text || '').join('');
  if (existingText === text) return blocks;
  const firstText = blocks.findIndex((block) => block.type === 'text');
  if (firstText >= 0) blocks[firstText] = { ...blocks[firstText], text };
  else if (text) blocks.unshift({ type: 'text', text });
  return blocks.filter((block) => block.type !== 'text' || Boolean(block.text?.trim()) || blocks.length > 1);
}

function initialCanonicalContent(question?: Partial<Question>) {
  if (question?.canonical_content) return structuredClone(question.canonical_content);
  const options = (question?.options?.length ? question.options : defaultOptions()).map((option, index) => ({
    label: String.fromCharCode(65 + index),
    content: canonicalOptionBlocks(option),
  }));
  const legacyStem = question?.content_blocks?.length
    ? question.content_blocks
    : [
        ...(question?.question_text ? [{ type: 'text' as const, text: question.question_text }] : []),
        ...(question?.question_latex ? [{ type: 'equation' as const, latex: question.question_latex }] : []),
        ...(question?.question_images || []).map((assetUrl) => ({ type: 'image' as const, assetUrl })),
      ];
  return {
    version: 'examforge-question-content/v1' as const,
    stem: structuredClone(legacyStem),
    options,
    explanation: question?.explanation ? [{ type: 'text' as const, text: question.explanation }] : [],
    answer: question?.correct_answers?.length ? question.correct_answers : question?.correct_option ?? question?.numerical_answer ?? question?.answer_text ?? null,
    provenance: { kind: question?.source || 'manual', sourceFile: question?.source_file || null },
    validation: { status: question?.status || 'pending', warnings: question?.extraction_warnings || [] },
  };
}

function optionFromCanonical(option: CanonicalQuestionContent['options'][number]): QuestionOption {
  return {
    text: option.content.filter((block) => block.type === 'text').map((block) => block.text || '').join(''),
    latex: option.content.find((block) => block.type === 'equation')?.latex || undefined,
    image: option.content.find((block) => block.type === 'image')?.assetUrl,
    contentBlocks: structuredClone(option.content),
  };
}

export function QuestionEditorForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Save question',
}: QuestionEditorFormProps) {
  const [subtype, setSubtype] = useState<EditorSubtype>(() => getSubtypeFromQuestion(initial));
  const [canonicalContent, setCanonicalContent] = useState<CanonicalQuestionContent>(() => initialCanonicalContent(initial));
  const [structuredEditing, setStructuredEditing] = useState(Boolean(initial?.canonical_content?.stem?.length || initial?.content_blocks?.length));
  const contentBlocks = canonicalContent.stem;
  const setContentBlocks = (next: ContentBlock[] | ((previous: ContentBlock[]) => ContentBlock[])) => {
    setCanonicalContent((previous) => ({ ...previous, stem: typeof next === 'function' ? next(previous.stem) : next }));
  };
  const options = canonicalContent.options.map(optionFromCanonical);
  const setOptions = (next: QuestionOption[] | ((previous: QuestionOption[]) => QuestionOption[])) => {
    setCanonicalContent((previous) => {
      const current = previous.options.map(optionFromCanonical);
      const updated = typeof next === 'function' ? next(current) : next;
      return { ...previous, options: updated.map((option, index) => ({ label: String.fromCharCode(65 + index), content: canonicalOptionBlocks(option) })) };
    });
  };
  const explanation = canonicalContent.explanation.filter((block) => block.type === 'text').map((block) => block.text || '').join('');
  const setExplanation = (text: string) => setCanonicalContent((previous) => ({
    ...previous,
    explanation: canonicalExplanationBlocks(previous.explanation, text),
  }));
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyPlain, setBodyPlain] = useState('');
  const [questionLatex, setQuestionLatexState] = useState('');
  const [questionImages, setQuestionImagesState] = useState<string[]>([]);
  const setQuestionLatex = (value: string) => {
    setQuestionLatexState(value);
    setCanonicalContent((previous) => {
      const equationIndex = previous.stem.findIndex((block) => block.type === 'equation');
      if (!value) return { ...previous, stem: previous.stem.filter((block) => block.type !== 'equation' || Boolean(block.omml || block.original)) };
      const stem = [...previous.stem];
      if (equationIndex >= 0) stem[equationIndex] = { ...stem[equationIndex], latex: value };
      else stem.push({ type: 'equation', latex: value });
      return { ...previous, stem };
    });
  };
  const setQuestionImages = (images: string[]) => {
    setQuestionImagesState(images);
    if (!images.length) return;
    setCanonicalContent((previous) => ({
      ...previous,
      stem: [...previous.stem.filter((block) => block.type !== 'image'), ...images.map((assetUrl) => ({ type: 'image' as const, assetUrl }))],
    }));
  };
  const [ocrText, setOcrText] = useState('');
  const [answerText, setAnswerTextState] = useState('');
  const [classLevel, setClassLevel] = useState(11);
  const [year, setYear] = useState<string | null>(null);
  const [customChapterName, setCustomChapterName] = useState('');
  const [isCustomChapter, setIsCustomChapter] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [correctOption, setCorrectOptionState] = useState<number | null>(() => {
    if (initial?.correct_option !== undefined && initial.correct_option !== null) {
      return parseAnswerToNumber(initial.correct_option);
    }
    return 0;
  });
  const [correctOptions, setCorrectOptionsState] = useState<number[]>(() => {
    if (initial?.correct_answers && initial.correct_answers.length > 0) {
      return initial.correct_answers
        .map(parseAnswerToNumber)
        .filter((val): val is number => val !== null);
    }
    const single = initial?.correct_option !== null && initial?.correct_option !== undefined
      ? parseAnswerToNumber(initial.correct_option)
      : null;
    return single !== null ? [single] : [];
  });
  const [numericalAnswer, setNumericalAnswerState] = useState('');
  const setCorrectOption = (value: number | null) => {
    setCorrectOptionState(value);
    setCanonicalContent((previous) => ({ ...previous, answer: value }));
  };
  const setCorrectOptions = (value: number[]) => {
    setCorrectOptionsState(value);
    setCanonicalContent((previous) => ({ ...previous, answer: value }));
  };
  const setNumericalAnswer = (value: string) => {
    setNumericalAnswerState(value);
    setCanonicalContent((previous) => ({ ...previous, answer: value.trim() ? Number(value) : null }));
  };
  const setAnswerText = (value: string) => {
    setAnswerTextState(value);
    setCanonicalContent((previous) => ({ ...previous, answer: value }));
  };
  const [tagsInput, setTagsInput] = useState('');

  const [syllabusTree, setSyllabusTree] = useState<SyllabusNode[]>([]);
  const [selectedExamPattern, setSelectedExamPattern] = useState('');
  const [selectedClassNode, setSelectedClassNode] = useState('');
  const [selectedSubjectNode, setSelectedSubjectNode] = useState('');
  const [selectedChapterNode, setSelectedChapterNode] = useState('');
  const [selectedTopicNode, setSelectedTopicNode] = useState('');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);

  /** Extract numeric class (e.g., "Class 11" → 11) from syllabus class node name */
  const getClassFromNode = useCallback((): number => {
    if (!selectedClassNode || !syllabusTree.length) return classLevel;
    const examPattern = syllabusTree.find(n => n._id === selectedExamPattern);
    if (!examPattern) return classLevel;
    const classNode = (examPattern.children || []).find(n => n._id === selectedClassNode);
    if (!classNode) return classLevel;
    const match = classNode.name.match(/(\d+)/);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (parsed >= 6 && parsed <= 12) return parsed;
    }
    return classLevel;
  }, [selectedClassNode, selectedExamPattern, syllabusTree, classLevel]);

  // Auto-update classLevel when syllabus class node changes
  useEffect(() => {
    if (selectedClassNode) {
      setClassLevel(getClassFromNode());
    }
  }, [selectedClassNode, getClassFromNode]);

  // Initialize syllabus tree and question banks on mount
  useEffect(() => {
    fetchSyllabusTree().then(setSyllabusTree).catch((err) => console.error('Failed to load syllabus tree:', err));
    fetchQuestionBanksApi().then(setQuestionBanks).catch((err) => console.error('Failed to load question banks:', err));
  }, []);

  const lastInitializedId = useRef<string | null>(null);
  const isTreeLoadedRef = useRef<boolean>(false);
  const [showPreview, setShowPreview] = useState(true);
  const [showAdvancedMath, setShowAdvancedMath] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reconstructing, setReconstructing] = useState(false);
  const [pipelineState, setPipelineState] = useState<'idle' | 'parsing' | 'ocr' | 'equations' | 'complete'>('idle');
  const [clipboardFidelity, setClipboardFidelity] = useState<'high' | 'medium' | 'ocr' | 'low_vml' | 'low' | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastReconstruct, setLastReconstruct] = useState<ReconstructResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconstructTimer = useRef<ReturnType<typeof setTimeout>>();

  const isMcq = ['mcq_single', 'mcq_multiple', 'assertion_reason', 'true_false'].includes(subtype);

  const selectSubtype = (val: EditorSubtype) => {
    setSubtype(val);
    setAutosaveStatus('saving');
    if (val === 'mcq_multiple') {
      if (correctOption !== null && !correctOptions.includes(correctOption)) {
        setCorrectOptions([correctOption]);
      }
    } else if (val === 'mcq_single') {
      if (correctOptions.length > 0) {
        setCorrectOption(correctOptions[0]);
      }
    }
  };

  useEffect(() => {
    if (!initial?.id) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const d = JSON.parse(draft);
          setBodyHtml(d.bodyHtml || '');
          setBodyPlain(d.bodyPlain || '');
          setContentBlocks(d.contentBlocks || initial?.canonical_content?.stem || initial?.content_blocks || []);
          setQuestionImages(d.questionImages || []);
          setOptions(d.options || defaultOptions());
          setSubtype(d.subtype || 'mcq_single');
          setCustomChapterName(d.customChapterName || '');
          setIsCustomChapter(d.isCustomChapter || false);
          setYear(d.year ?? null);
          setOcrText(d.ocrText || '');
          setAnswerText(d.answerText || '');
          setCorrectOption(d.correctOption !== undefined ? d.correctOption : 0);
          setCorrectOptions(d.correctOptions || []);
          
          if (d.syllabusMapping) {
            setSelectedExamPattern(d.syllabusMapping.examPatternId || '');
            setSelectedClassNode(d.syllabusMapping.classId || '');
            setSelectedSubjectNode(d.syllabusMapping.subjectId || '');
            setSelectedChapterNode(d.syllabusMapping.chapterId || '');
            setSelectedTopicNode(d.syllabusMapping.topicId || '');
          }
        } catch {
          /* ignore */
        }
      }
      return;
    }

    const isTreeLoaded = syllabusTree.length > 0;
    if (lastInitializedId.current === initial.id && (isTreeLoadedRef.current || !isTreeLoaded)) {
      return;
    }

    // Check if an edit draft exists for this specific question
    const editDraftKey = `${DRAFT_KEY}_${initial.id}`;
    const draft = localStorage.getItem(editDraftKey);
    let d: any = null;
    if (draft) {
      try {
        d = JSON.parse(draft);
      } catch {
        /* ignore */
      }
    }

    const text = d?.bodyHtml || initial.question_text || '';
    setContentBlocks(d?.contentBlocks || initial.canonical_content?.stem || initial.content_blocks || []);
    setBodyHtml(text);
    setBodyPlain(text.replace(/<[^>]+>/g, ' '));
    setQuestionLatex(d?.questionLatex || initial.question_latex || '');
    setQuestionImages(d?.questionImages || initial.question_images || []);
    setOptions(
      d?.options ||
      ((initial.options as QuestionOption[])?.length
        ? (initial.options as QuestionOption[])
        : defaultOptions())
    );
    setExplanation(d?.explanation || initial.explanation || '');
    setAnswerText(d?.answerText || initial.answer_text || '');
    setClassLevel(d?.classLevel || initial.class || 11);
    setYear(d?.year ?? initial.year ?? null);
    setCustomChapterName(d?.customChapterName || '');
    setIsCustomChapter(d?.isCustomChapter || false);
    setDifficulty(d?.difficulty || initial.difficulty || 'medium');
    setCorrectOption(d?.correctOption !== undefined ? d.correctOption : (initial.correct_option !== undefined && initial.correct_option !== null ? parseAnswerToNumber(initial.correct_option) : 0));
    setCorrectOptions(
      d?.correctOptions ||
      (initial.correct_answers && initial.correct_answers.length > 0
        ? initial.correct_answers.map(parseAnswerToNumber).filter((v): v is number => v !== null)
        : (initial.correct_option !== null && initial.correct_option !== undefined ? [parseAnswerToNumber(initial.correct_option)].filter((v): v is number => v !== null) : []))
    );
    setNumericalAnswer(
      d?.numericalAnswer != null
        ? String(d.numericalAnswer)
        : (initial.numerical_answer != null ? String(initial.numerical_answer) : '')
    );
    setTagsInput(
      d?.tagsInput ||
      (initial.tags || []).filter((t) => !SUBTYPE_OPTIONS.some((o) => o.value === t)).join(', ')
    );
    const sub = d?.subtype || getSubtypeFromQuestion(initial);
    if (sub) setSubtype(sub);

    setSelectedBankId(d?.selectedBankId || initial.bank_ids?.[0] || '');

    const mapping = initial?.syllabus_mappings?.[0] || d?.syllabusMapping;
    if (mapping) {
      let resolvedExamPattern = mapping.examPatternId || '';
      let resolvedClass = mapping.classId || '';
      let resolvedSubject = mapping.subjectId || '';
      let resolvedChapter = mapping.chapterId || '';
      let resolvedTopic = mapping.topicId || '';

      if (syllabusTree.length > 0) {
        const deepestId = resolvedTopic || resolvedChapter || resolvedSubject || resolvedClass;
        if (deepestId) {
          const path = findPathInTree(syllabusTree, deepestId);
          if (path && path.length > 0) {
            resolvedExamPattern = path[0] || '';
            resolvedClass = path[1] || '';
            resolvedSubject = path[2] || '';
            resolvedChapter = path[3] || '';
            resolvedTopic = path[4] || '';
          }
        }
      }

      setSelectedExamPattern(resolvedExamPattern);
      setSelectedClassNode(resolvedClass);
      setSelectedSubjectNode(resolvedSubject);
      setSelectedChapterNode(resolvedChapter);
      setSelectedTopicNode(resolvedTopic);
    } else {
      setSelectedExamPattern('');
      setSelectedClassNode('');
      setSelectedSubjectNode('');
      setSelectedChapterNode('');
      setSelectedTopicNode('');
    }

    lastInitializedId.current = initial.id;
    isTreeLoadedRef.current = isTreeLoaded;
  }, [initial?.id, syllabusTree]);

  const persistDraft = useCallback(() => {
    const key = initial?.id ? `${DRAFT_KEY}_${initial.id}` : DRAFT_KEY;
    setAutosaveStatus('saving');
    localStorage.setItem(
      key,
      JSON.stringify({
        bodyHtml,
        bodyPlain,
        contentBlocks,
        questionImages,
        options,
        subtype,
        customChapterName,
        isCustomChapter,
        ocrText,
        explanation,
        answerText,
        classLevel,
        year,
        difficulty,
        correctOption,
        correctOptions,
        numericalAnswer,
        tagsInput,
        selectedBankId,
        syllabusMapping: {
          examPatternId: selectedExamPattern,
          classId: selectedClassNode,
          subjectId: selectedSubjectNode,
          chapterId: selectedChapterNode,
          topicId: selectedTopicNode,
        },
      })
    );
    setTimeout(() => setAutosaveStatus('saved'), 350);
  }, [initial?.id, bodyHtml, bodyPlain, contentBlocks, questionImages, options, subtype, customChapterName, isCustomChapter, ocrText, explanation, answerText, classLevel, year, difficulty, correctOption, correctOptions, numericalAnswer, tagsInput, selectedBankId, selectedExamPattern, selectedClassNode, selectedSubjectNode, selectedChapterNode, selectedTopicNode]);

  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(persistDraft, 800);
    return () => clearTimeout(autosaveTimer.current);
  }, [persistDraft]);

  const triggerReconstruction = useCallback(
    (payload: { html: string; plain: string; images: string[]; blocks?: SemanticBlock[]; rawClipboardHtml?: string }) => {
      if (reconstructTimer.current) clearTimeout(reconstructTimer.current);
      reconstructTimer.current = setTimeout(async () => {
        const plainLen = (payload.plain || payload.html?.replace(/<[^>]+>/g, ' ') || '').trim().length;
        if (plainLen < 12 && !payload.images.length && !ocrText.trim()) return;

        const rawHtml = payload.rawClipboardHtml || payload.html;
        if (rawHtml && detectVmlEquationImages(rawHtml)) {
          setClipboardFidelity('low_vml');
        } else if (rawHtml) {
          setClipboardFidelity('medium');
        } else if (payload.plain || ocrText) {
          setClipboardFidelity('ocr');
        } else {
          setClipboardFidelity('low');
        }

        setReconstructing(true);
        setPipelineState('parsing');

        try {
          await new Promise((resolve) => setTimeout(resolve, 200));
          if (payload.images?.length > 0) {
            setPipelineState('ocr');
            await new Promise((resolve) => setTimeout(resolve, 350));
          }
          setPipelineState('equations');
          await new Promise((resolve) => setTimeout(resolve, 250));
          setPipelineState('parsing');

          const result = await runQuestionReconstruction({
            html: rawHtml || payload.html,
            plain: payload.plain,
            ocrText,
            images: payload.images,
            useGemini: false,
            blocks: payload.blocks,
          });
          
          setPipelineState('complete');
          
          applyReconstructResult(result, {
            setBodyHtml,
            setBodyPlain,
            setQuestionLatex,
            setQuestionImages,
            setContentBlocks,
            setOptions,
            setSubtype,
            setNumericalAnswer,
            setCorrectOption,
            setTagsInput,
          });
          setLastReconstruct(result);
          
          const src = [
            result.sources.parser && 'parser',
            result.sources.ocr && 'OCR',
          ]
            .filter(Boolean)
            .join(' + ');
          toast.success(`Reconstructed (${result.subtype.replace(/_/g, ' ')})${src ? ` · ${src}` : ''}`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Reconstruction failed');
          setPipelineState('idle');
        } finally {
          setReconstructing(false);
          setTimeout(() => setPipelineState('idle'), 1200);
        }
      }, 600);
    },
    [ocrText]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (e.shiftKey) {
          e.preventDefault();
          handleSubmit(true);
        } else {
          e.preventDefault();
          handleSubmit(false);
        }
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowPreview((prev) => !prev);
      }
      
      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        if (idx < options.length) {
          setCorrectOption(idx);
          toast.success(`Set correct option to ${String.fromCharCode(65 + idx)}`);
        }
      }
      
      if (e.altKey && e.shiftKey && ['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        if (idx < SUBTYPE_OPTIONS.length) {
          const newSub = SUBTYPE_OPTIONS[idx].value;
          selectSubtype(newSub);
          toast.success(`Switched type to ${SUBTYPE_OPTIONS[idx].label}`);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [options.length, subtype, bodyHtml, bodyPlain, correctOption, numericalAnswer, explanation, classLevel, tagsInput, difficulty]);

  const insertLatex = (snippet: string) => {
    const wrapped = snippet.startsWith('$$') ? snippet : autoWrapEquations(snippet);
    setBodyPlain((t) => (t ? `${t} ${wrapped}` : wrapped));
    setBodyHtml((h) => `${h || ''}<p>${wrapped}</p>`);
    const latex = extractPrimaryLatex(wrapped);
    if (latex) setQuestionLatex(latex);
  };

  const validate = (): string[] => {
    const text = bodyPlain || bodyHtml.replace(/<[^>]+>/g, ' ').trim();
    const errs: string[] = [];
    if (text.length < 5) errs.push('Question content is required');
    if (!selectedExamPattern) errs.push('Exam pattern is required (select from Classification tree)');
    if (!selectedSubjectNode) errs.push('Subject is required (select from Classification tree)');
    if (isMcq) {
      const filled = options.filter(hasOptionContent).length;
      if (filled < 2) errs.push('MCQ needs at least 2 options');
      if (['mcq_single', 'assertion_reason', 'true_false'].includes(subtype) && correctOption === null) errs.push('Select correct option');
      if (subtype === 'mcq_multiple' && correctOptions.length === 0) errs.push('Select at least one correct option');
    }
    if (['integer', 'numerical'].includes(subtype) && (!numericalAnswer || !Number.isFinite(Number(numericalAnswer)))) errs.push('Enter a valid numerical answer');
    if (['fill_blank', 'match_following'].includes(subtype) && !answerText.trim()) errs.push('Correct answer is required');
    return errs;
  };

  const buildPayload = (): Record<string, unknown> => {
    const sub = SUBTYPE_OPTIONS.find((s) => s.value === subtype)!;
    const structuredText = contentBlocks.map((block) => block.type === 'equation' ? block.latex || '' : block.type === 'text' ? block.text || '' : '').filter(Boolean).join(' ').trim();
    const displayText = contentBlocks.length ? structuredText : (bodyHtml.trim() || autoWrapEquations(bodyPlain.trim()));
    const autoLatex = extractPrimaryLatex(displayText);
    const tags = [
      subtype,
      ...tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
    ];
    const syllabusMappings = [];
    if (selectedExamPattern || selectedClassNode || selectedSubjectNode || selectedChapterNode || selectedTopicNode) {
      syllabusMappings.push({
        examPatternId: selectedExamPattern || null,
        classId: selectedClassNode || null,
        subjectId: selectedSubjectNode || null,
        chapterId: selectedChapterNode || null,
        topicId: selectedTopicNode || null,
      });
    }

    // Derive class from syllabus tree class node name (e.g., "Class 11" → 11)
    const derivedClass = selectedClassNode ? getClassFromNode() : classLevel;
    const canonicalAnswer = subtype === 'mcq_multiple' ? correctOptions
      : ['integer', 'numerical'].includes(subtype) ? (numericalAnswer ? Number(numericalAnswer) : null)
        : ['fill_blank', 'match_following'].includes(subtype) ? answerText.trim() || null
          : correctOption;

    return {
      content_blocks: contentBlocks.length ? contentBlocks : [{ type: 'text', text: bodyPlain.trim() }],
      canonical_content: {
        ...canonicalContent,
        version: 'examforge-question-content/v1',
        stem: contentBlocks.length ? contentBlocks : [{ type: 'text', text: bodyPlain.trim() }],
        options: isMcq ? options.filter(hasOptionContent).map((option, index) => ({
          label: String.fromCharCode(65 + index),
          content: canonicalOptionBlocks(option),
        })) : [],
        explanation: canonicalExplanationBlocks(initial?.canonical_content?.explanation, explanation.trim()),
        answer: canonicalAnswer,
        provenance: canonicalContent.provenance || { kind: initial?.source || 'manual', sourceFile: initial?.source_file || null },
        validation: canonicalContent.validation || {},
      },
      question_text: displayText,
      question_latex: questionLatex.trim() || autoLatex || null,
      question_images: questionImages,
      question_type: sub.questionType,
      class: derivedClass,
      year: year || null,
      chapter_name: (isCustomChapter && !selectedChapterNode) ? customChapterName || null : null,
      difficulty,
      options: isMcq ? options.filter(hasOptionContent) : [],
      correct_option: isMcq ? (subtype === 'mcq_multiple' ? (correctOptions[0] ?? null) : correctOption) : null,
      correct_answers: subtype === 'mcq_multiple' ? correctOptions.map(String)
        : ['mcq_single', 'assertion_reason', 'true_false'].includes(subtype) && correctOption !== null ? [String(correctOption)] : [],
      numerical_answer:
        ['NUMERICAL', 'NUMERICAL_INTEGER'].includes(sub.questionType) && numericalAnswer
          ? Number(numericalAnswer)
          : null,
      answer_text:
        ['FILL_BLANK', 'MATCH_FOLLOWING'].includes(sub.questionType)
          ? answerText.trim() || null
          : null,
      explanation: explanation.trim() || null,
      tags: [...new Set(tags)],
      status: 'pending',
      source: 'manual',
      has_diagram: questionImages.length > 0,
      syllabus_mappings: syllabusMappings,
      bank_ids: selectedBankId ? [selectedBankId] : [],
    };
  };

  const previewQuestion: Question = {
    id: 'preview',
    question_text: bodyPlain.trim() || bodyHtml,
    content_blocks: contentBlocks,
    question_latex: questionLatex || extractPrimaryLatex(bodyHtml || bodyPlain) || null,
    question_type: SUBTYPE_OPTIONS.find((s) => s.value === subtype)!.questionType,
    question_images: questionImages,
    options: isMcq ? options.filter(hasOptionContent) : [],
    correct_option: subtype === 'mcq_multiple' ? (correctOptions[0] ?? null) : correctOption,
    correct_answers: subtype === 'mcq_multiple' ? correctOptions.map(String)
      : ['mcq_single', 'assertion_reason', 'true_false'].includes(subtype) && correctOption !== null ? [String(correctOption)] : [],
    numerical_answer: numericalAnswer ? Number(numericalAnswer) : null,
    numerical_tolerance: 0,
    answer_text: answerText || null,
    difficulty,
    marks: null,
    class: classLevel,
    year: year || null,
    explanation: explanation || null,
    explanation_latex: null,
    explanation_images: [],
    diagrams: [],
    has_diagram: questionImages.length > 0,
    has_equation: Boolean(questionLatex || /\$/.test(bodyPlain)),
    tags: [subtype, ...tagsInput.split(',').map((t) => t.trim()).filter(Boolean)],
    ai_confidence: 0,
    ai_metadata: { provider: 'manual', reconstruction: lastReconstruct?.sources },
    status: 'pending',
    subject_id: selectedSubjectNode || null,
    chapter_id: selectedChapterNode || null,
    exam_type_id: selectedExamPattern || null,
    syllabus_mappings: [
      {
        examPatternId: selectedExamPattern || null,
        classId: selectedClassNode || null,
        subjectId: selectedSubjectNode || null,
        chapterId: selectedChapterNode || null,
        topicId: selectedTopicNode || null,
      }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
    source: 'manual',
    source_file: null,
    extracted_from: null,
    created_by: null,
  };

  const handleSubmit = async (asDraft: boolean) => {
    const errs = validate();
    if (!asDraft && errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setIsSaving(true);
    try {
      const payload = buildPayload();
      if (asDraft) payload.status = 'needs_review';
      await onSubmit(payload);
      const key = initial?.id ? `${DRAFT_KEY}_${initial.id}` : DRAFT_KEY;
      localStorage.removeItem(key);
      toast.success(asDraft ? 'Draft saved' : 'Question saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-3 xl:gap-4">
      <div className="space-y-2.5 min-w-0 order-2 lg:order-1">
        {errors.length > 0 && (
          <Alert variant="error" title="Fix before publishing">
            <ul className="list-disc pl-4 text-xs">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}

        {initial && (initial.extraction_warnings?.length || initial.ai_confidence || initial.parser_confidence || initial.canonical_content?.provenance || (initial.canonical_content?.validation?.warnings as string[] | undefined)?.length) ? (
          <Card className="p-3 space-y-1 text-xs">
            <p className="font-semibold">Review evidence</p>
            {(initial.extraction_warnings || (initial.canonical_content?.validation?.warnings as string[]) || []).map((warning, index) => <p key={index} className="text-amber-700">{warning}</p>)}
            <p>Confidence: {initial.ai_confidence ?? 'unavailable'}{initial.parser_confidence != null ? ` · parser ${Math.round(initial.parser_confidence * 100)}%` : ''}{initial.reconstruction_fidelity != null ? ` · reconstruction ${Math.round(initial.reconstruction_fidelity * 100)}%` : ''}</p>
            {initial.canonical_content?.provenance && <p className="break-all text-slate-500">Source: {JSON.stringify(initial.canonical_content.provenance)}</p>}
          </Card>
        ) : null}

        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Question Content & Ingestion
          </div>
          <div className="text-xs font-bold text-slate-650 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded border border-slate-200 dark:border-slate-750">
            Question ID: {initial?.serial_id ? `Q-${initial.serial_id}` : 'New Question (Assigned on save)'}
          </div>
        </div>
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Paste & Reconstruct</h3>
              {clipboardFidelity && (
                <Badge
                  variant={
                    clipboardFidelity === 'high'
                      ? 'success'
                      : clipboardFidelity === 'medium'
                      ? 'info'
                      : clipboardFidelity === 'ocr'
                      ? 'default'
                      : clipboardFidelity === 'low_vml'
                      ? 'error'
                      : 'default'
                  }
                  size="sm"
                >
                  {clipboardFidelity === 'high' && 'High Fidelity'}
                  {clipboardFidelity === 'medium' && 'Medium Fidelity'}
                  {clipboardFidelity === 'ocr' && 'OCR Ingest'}
                  {clipboardFidelity === 'low_vml' && 'Image-Based Math Detected'}
                  {clipboardFidelity === 'low' && 'Low Fidelity'}
                </Badge>
              )}
            </div>
            <Badge variant="info" size="sm">
              {reconstructing ? 'Working…' : 'Deterministic parsing · optional OCR'}
            </Badge>
          </div>

          {clipboardFidelity === 'low_vml' && (
            <Alert variant="warning" title="Word Pasted Equations as Rendered Images">
              Word pasted equations as rendered images instead of semantic math. For accurate mathematical preservation, please upload the DOCX file directly instead of pasting.
            </Alert>
          )}
          
          <div className="flex flex-wrap gap-1 mb-1">
            {SUBTYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectSubtype(opt.value)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-all ${
                  subtype === opt.value
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {structuredEditing ? (
            <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-900 dark:bg-indigo-950/20">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Structured document content</p>
                <p className="text-xs text-slate-500">Edit text and normalized equations in place. Original equation source, images, and table layout stay attached.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setContentBlocks((blocks) => [...blocks, { type: 'text', text: '' }])}>Add text</button>
                  <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setContentBlocks((blocks) => [...blocks, { type: 'equation', latex: '', displayMode: true }])}>Add equation</button>
                  <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setContentBlocks((blocks) => [...blocks, { type: 'table', rows: [[{ text: '' }, { text: '' }], [{ text: '' }, { text: '' }]] }])}>Add 2 × 2 table</button>
                  <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setContentBlocks((blocks) => [...blocks, { type: 'image', assetUrl: '' }])}>Add image reference</button>
                </div>
              </div>
              {contentBlocks.map((block, index) => (
                <div key={`${block.type}-${index}`} className="rounded-md border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                  {block.type === 'text' ? (
                    <textarea aria-label={`Text block ${index + 1}`} className="w-full rounded border border-slate-200 p-2 text-sm dark:border-slate-700 dark:bg-slate-800" rows={Math.min(5, Math.max(2, (block.text || '').split('\n').length))} value={block.text || ''} onChange={(event) => setContentBlocks((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} />
                  ) : block.type === 'equation' ? (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{block.source === 'mathtype' ? 'MathType equation (original object retained)' : 'Equation LaTeX'}</label>
                      <textarea aria-label={`Equation ${index + 1} LaTeX`} className="w-full rounded border border-slate-200 p-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800" rows={2} value={block.latex || ''} placeholder="Enter a reviewed LaTeX equivalent if automatic conversion was unavailable" onChange={(event) => setContentBlocks((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, latex: event.target.value || null, warning: item.source === 'mathtype' && event.target.value ? 'Manual normalization entered; compare with original MathType object' : item.warning, fidelity: event.target.value ? 0.8 : item.fidelity } : item))} />
                      {block.warning && <p className="text-xs text-amber-700">{block.warning}</p>}
                    </div>
                  ) : block.type === 'image' ? (
                    <div className="space-y-2">
                      {block.assetUrl && <img src={block.assetUrl} alt={`Question image ${index + 1}`} className="max-h-64 max-w-full object-contain" />}
                      <label className="block text-xs text-slate-600 dark:text-slate-300">Replace image
                        <input aria-label={`Replace image ${index + 1}`} type="file" accept="image/*" className="mt-1 block w-full text-sm" onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => setContentBlocks((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, assetUrl: String(reader.result) } : item));
                          reader.readAsDataURL(file);
                        }} />
                      </label>
                      <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setContentBlocks((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}>Remove image</button>
                    </div>
                  ) : block.type === 'table' ? (
                    <div className="space-y-2 overflow-x-auto">
                      <p className="text-xs text-slate-600 dark:text-slate-300">Table cells retain their source order and spans.</p>
                      <div className="flex gap-2">
                        <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setContentBlocks((previous) => previous.map((item, itemIndex) => itemIndex === index && item.type === 'table' ? { ...item, rows: [...(item.rows || []), Array.from({ length: item.rows?.[0]?.length || 1 }, () => ({ text: '' }))] } : item))}>Add row</button>
                        <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setContentBlocks((previous) => previous.map((item, itemIndex) => itemIndex === index && item.type === 'table' && (item.rows || []).length > 1 ? { ...item, rows: item.rows!.slice(0, -1) } : item))}>Remove last row</button>
                        <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setContentBlocks((previous) => previous.map((item, itemIndex) => itemIndex === index && item.type === 'table' ? { ...item, rows: (item.rows || []).map((row) => [...row, { text: '' }]) } : item))}>Add column</button>
                        <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setContentBlocks((previous) => previous.map((item, itemIndex) => itemIndex === index && item.type === 'table' && (item.rows?.[0]?.length || 0) > 1 ? { ...item, rows: item.rows!.map((row) => row.slice(0, -1)) } : item))}>Remove last column</button>
                      </div>
                      {(block.rows || []).map((row, rowIndex) => <div key={rowIndex} className="flex gap-2">{(row || []).map((cell, cellIndex) => cell ? <input key={cellIndex} aria-label={`Table ${index + 1}, row ${rowIndex + 1}, cell ${cellIndex + 1}`} className="min-w-24 flex-1 rounded border p-2 text-sm dark:border-slate-700 dark:bg-slate-800" value={cell.text || ''} onChange={(event) => setContentBlocks((previous) => previous.map((item, itemIndex) => {
                        if (itemIndex !== index || item.type !== 'table') return item;
                        const rows = (item.rows || []).map((cells, r) => r === rowIndex ? cells.map((entry, c) => c === cellIndex && entry ? { ...entry, text: event.target.value } : entry) : cells);
                        return { ...item, rows };
                      }))} /> : null)}</div>)}
                    </div>
                  ) : <p className="text-xs text-amber-700">Embedded source retained for review; this source object is read-only.</p>}
                </div>
              ))}
            </div>
          ) : (
          <div className="space-y-2">
          <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => {
            if (!contentBlocks.length && bodyPlain.trim()) setContentBlocks([{ type: 'text', text: bodyPlain.trim() }]);
            setStructuredEditing(true);
          }}>Edit as structured content</button>
          <RichQuestionEditor
            value={bodyHtml}
            images={questionImages}
            ocrText={ocrText}
            onOcrTextChange={setOcrText}
            onChange={(html, plain) => {
              setBodyHtml(html);
              setBodyPlain(plain);
              setCanonicalContent((previous) => ({ ...previous, stem: plain.trim() ? [{ type: 'text', text: plain }] : [] }));
              const latex = extractPrimaryLatex(plain || html);
              if (latex) setQuestionLatex(latex);
              setAutosaveStatus('saving');
            }}
            onImagesChange={(imgs) => {
              setQuestionImages(imgs);
              setAutosaveStatus('saving');
            }}
            onPastePayload={triggerReconstruction}
          />
          </div>
          )}
          <details
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20"
            open={showAdvancedMath}
            onToggle={(e) => setShowAdvancedMath((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 select-none">
              Advanced equation tools
            </summary>
            <div className="px-2.5 pb-2.5 space-y-2">
              <LatexToolbar onInsert={insertLatex} />
              <Input
                label="Display LaTeX override (optional)"
                value={questionLatex}
                onChange={(e) => setQuestionLatex(e.target.value)}
                placeholder="Auto-detected from $...$ in content"
                className="py-1 text-sm"
              />
            </div>
          </details>
        </Card>

        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-4 mb-1 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          Options & Answers
        </div>

        {isMcq && (
          <Card className="p-4 space-y-3">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm border-b border-slate-100 dark:border-slate-800 pb-2">Options Configuration</h3>
            <OptionRichFields
              options={options}
              subtype={subtype === 'mcq_multiple' ? 'mcq_multiple' : 'mcq_single'}
              correctOption={correctOption}
              correctOptions={correctOptions}
              onOptionsChange={(opts) => {
                setOptions(opts);
                setAutosaveStatus('saving');
              }}
              onCorrectChange={(idx) => {
                setCorrectOption(idx);
                setAutosaveStatus('saving');
              }}
              onCorrectOptionsChange={(indices) => {
                setCorrectOptions(indices);
                setAutosaveStatus('saving');
              }}
            />
          </Card>
        )}

        {(subtype === 'integer' || subtype === 'numerical') && (
          <Card className="p-3">
            <Input
              label="Answer"
              type="number"
              step="any"
              value={numericalAnswer}
              onChange={(e) => {
                setNumericalAnswer(e.target.value);
                setAutosaveStatus('saving');
              }}
              className="py-1 text-sm"
            />
          </Card>
        )}

        {['fill_blank', 'match_following'].includes(subtype) && (
          <Card className="p-3">
            <Textarea
              label={subtype === 'match_following' ? 'Correct matching answer' : 'Correct answer'}
              value={answerText}
              onChange={(e) => {
                setAnswerText(e.target.value);
                setAutosaveStatus('saving');
              }}
              rows={4}
              className="py-1 text-sm"
              placeholder={subtype === 'match_following' ? 'Enter the correct pair mapping' : 'Enter the expected answer'}
            />
          </Card>
        )}

        <Card className="p-3">
          <Input
            label="Explanation (optional)"
            value={explanation}
            onChange={(e) => {
              setExplanation(e.target.value);
              setAutosaveStatus('saving');
            }}
            className="py-1 text-sm"
          />
        </Card>

        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-4 mb-1 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          Classification
        </div>
        <Card className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Select
            label="Exam Pattern"
            value={selectedExamPattern}
            onChange={(e) => {
              setSelectedExamPattern(e.target.value);
              setSelectedClassNode('');
              setSelectedSubjectNode('');
              setSelectedChapterNode('');
              setSelectedTopicNode('');
              setAutosaveStatus('saving');
            }}
            options={[{ value: '', label: 'Select Exam Pattern…' }, ...syllabusTree.map(n => ({ value: n._id, label: n.name }))]}
            className="py-1 text-xs"
          />
          <Select
            label="Class"
            value={selectedClassNode}
            onChange={(e) => {
              setSelectedClassNode(e.target.value);
              setSelectedSubjectNode('');
              setSelectedChapterNode('');
              setSelectedTopicNode('');
              setAutosaveStatus('saving');
            }}
            options={[
              { value: '', label: 'Select Class…' },
              ...(syllabusTree.find(n => n._id === selectedExamPattern)?.children || []).map(n => ({ value: n._id, label: n.name }))
            ]}
            disabled={!selectedExamPattern}
            className="py-1 text-xs"
          />
          <Select
            label="Subject"
            value={selectedSubjectNode}
            onChange={(e) => {
              setSelectedSubjectNode(e.target.value);
              setSelectedChapterNode('');
              setSelectedTopicNode('');
              setAutosaveStatus('saving');
            }}
            options={[
              { value: '', label: 'Select Subject…' },
              ...((syllabusTree.find(n => n._id === selectedExamPattern)?.children || [])
                .find(n => n._id === selectedClassNode)?.children || []).map(n => ({ value: n._id, label: n.name }))
            ]}
            disabled={!selectedClassNode}
            className="py-1 text-xs"
          />
          <Select
            label="Chapter"
            value={selectedChapterNode}
            onChange={(e) => {
              setSelectedChapterNode(e.target.value);
              setSelectedTopicNode('');
              setAutosaveStatus('saving');
            }}
            options={[
              { value: '', label: 'Select Chapter…' },
              ...(((syllabusTree.find(n => n._id === selectedExamPattern)?.children || [])
                .find(n => n._id === selectedClassNode)?.children || [])
                .find(n => n._id === selectedSubjectNode)?.children || []).map(n => ({ value: n._id, label: n.name }))
            ]}
            disabled={!selectedSubjectNode}
            className="py-1 text-xs"
          />
          <Select
            label="Topic"
            value={selectedTopicNode}
            onChange={(e) => {
              setSelectedTopicNode(e.target.value);
              setAutosaveStatus('saving');
            }}
            options={[
              { value: '', label: 'Select Topic…' },
              ...((((syllabusTree.find(n => n._id === selectedExamPattern)?.children || [])
                .find(n => n._id === selectedClassNode)?.children || [])
                .find(n => n._id === selectedSubjectNode)?.children || [])
                .find(n => n._id === selectedChapterNode)?.children || []).map(n => ({ value: n._id, label: n.name }))
            ]}
            disabled={!selectedChapterNode}
            className="py-1 text-xs"
          />
          <Select
            label="Difficulty"
            value={difficulty}
            onChange={(e) => {
              setDifficulty(e.target.value as 'easy' | 'medium' | 'hard');
              setAutosaveStatus('saving');
            }}
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'medium', label: 'Medium' },
              { value: 'hard', label: 'Hard' },
            ]}
            className="py-1 text-xs"
          />
          <Input
            label="Year (optional)"
            type="text"
            value={year === null ? '' : year}
            onChange={(e) => {
              const val = e.target.value;
              setYear(val === '' ? null : val);
              setAutosaveStatus('saving');
            }}
            placeholder="[2024] or [Jan 2024]"
            className="py-1 text-xs"
          />
          <Select
            label="Question Bank"
            value={selectedBankId}
            onChange={(e) => {
              setSelectedBankId(e.target.value);
              setAutosaveStatus('saving');
            }}
            options={[
              { value: '', label: 'System Global Bank' },
              ...questionBanks.map((qb) => ({ value: qb._id, label: qb.name })),
            ]}
            className="py-1 text-xs"
          />
          <Input
            label="Tags"
            value={tagsInput}
            onChange={(e) => {
              setTagsInput(e.target.value);
              setAutosaveStatus('saving');
            }}
            className="col-span-2 sm:col-span-3 py-1 text-sm"
            placeholder="comma-separated"
          />
        </Card>

        <div className="flex flex-wrap items-center gap-2 pb-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={reconstructing}
            onClick={() =>
              triggerReconstruction({
                html: bodyHtml,
                plain: bodyPlain,
                images: questionImages,
              })
            }
          >
            Re-run reconstruction
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleSubmit(true)} disabled={isSaving}>
            Save draft
          </Button>
          <Button size="sm" onClick={() => handleSubmit(false)} disabled={isSaving}>
            {isSaving ? 'Saving…' : submitLabel}
          </Button>

          <div className="ml-auto flex items-center gap-1.5 px-2">
            {autosaveStatus === 'saving' && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500 animate-pulse">Saving draft…</span>
            )}
            {autosaveStatus === 'saved' && (
              <span className="text-[11px] text-green-500 dark:text-green-400 font-semibold">✓ Autosaved draft</span>
            )}
          </div>
        </div>
      </div>

      <div className="lg:sticky lg:top-2 h-fit space-y-2 order-1 lg:order-2 max-h-[calc(100dvh-5rem)] overflow-y-auto">
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
              Live reconstruction preview
            </h3>
            <Button size="sm" variant="ghost" onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showPreview && (
            <ReconstructionPreview
              previewQuestion={previewQuestion}
              subtype={subtype}
              reconstructing={reconstructing}
              lastResult={lastReconstruct}
              pipelineState={pipelineState}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
