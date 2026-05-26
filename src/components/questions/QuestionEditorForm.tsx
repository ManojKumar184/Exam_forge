import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Card, Alert, Badge } from '../ui';
import { LatexToolbar } from './LatexToolbar';
import { RichQuestionEditor } from './RichQuestionEditor';
import { ReconstructionPreview } from './ReconstructionPreview';
import { OptionRichFields } from './OptionRichFields';
import type { Question, QuestionOption, QuestionType } from '../../types';
import { detectVmlEquationImages, type EditorSubtype } from '../../utils/questionPasteDetect';
import {
  runQuestionReconstruction,
  type ReconstructResult,
} from '../../utils/questionReconstruct';
import { autoWrapEquations, extractPrimaryLatex } from '../../utils/equationAutoWrap';
import { useDataStore } from '../../stores/dataStore';
import type { SemanticBlock } from '../../utils/clipboardIngestion';

const DRAFT_KEY = 'examforge_question_draft';

interface QuestionEditorFormProps {
  initial?: Partial<Question>;
  subjects: Array<{ id: string; name: string }>;
  chapters: Array<{ id: string; name: string; subject_id: string; chapter_number?: number | null }>;
  examTypes: Array<{ id: string; name: string }>;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

const SUBTYPE_OPTIONS: { value: EditorSubtype; label: string; questionType: QuestionType }[] = [
  { value: 'mcq_single', label: 'MCQ (Single)', questionType: 'mcq' },
  { value: 'mcq_multiple', label: 'MCQ (Multiple)', questionType: 'mcq' },
  { value: 'integer', label: 'Integer', questionType: 'numerical' },
  { value: 'numerical', label: 'Numerical', questionType: 'numerical' },
  { value: 'descriptive', label: 'Descriptive', questionType: 'descriptive' },
  { value: 'comprehension', label: 'Comprehension', questionType: 'descriptive' },
  { value: 'match_following', label: 'Match Columns', questionType: 'descriptive' },
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

function applyReconstructResult(
  result: ReconstructResult,
  setters: {
    setBodyHtml: (v: string) => void;
    setBodyPlain: (v: string) => void;
    setQuestionLatex: (v: string) => void;
    setQuestionImages: (v: string[]) => void;
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
  
  setters.setSubtype(result.subtype);
  if (result.numericalAnswer != null) {
    setters.setNumericalAnswer(String(result.numericalAnswer));
  }
  if (result.correctOption != null) setters.setCorrectOption(result.correctOption);
  setters.setTagsInput((prev) => {
    const existing = prev.split(',').map((t) => t.trim()).filter(Boolean);
    return [...new Set([...result.tags, ...existing])].join(', ');
  });
}

export function QuestionEditorForm({
  initial,
  subjects,
  chapters,
  examTypes,
  onSubmit,
  onCancel,
  submitLabel = 'Save question',
}: QuestionEditorFormProps) {
  const [subtype, setSubtype] = useState<EditorSubtype>('mcq_single');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyPlain, setBodyPlain] = useState('');
  const [questionLatex, setQuestionLatex] = useState('');
  const [questionImages, setQuestionImages] = useState<string[]>([]);
  const [ocrText, setOcrText] = useState('');
  const [options, setOptions] = useState<QuestionOption[]>(defaultOptions());
  const [explanation, setExplanation] = useState('');
  const [classLevel, setClassLevel] = useState(11);
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [examTypeId, setExamTypeId] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [correctOption, setCorrectOption] = useState<number | null>(0);
  const [numericalAnswer, setNumericalAnswer] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [showAdvancedMath, setShowAdvancedMath] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reconstructing, setReconstructing] = useState(false);
  const [pipelineState, setPipelineState] = useState<'idle' | 'parsing' | 'ocr' | 'equations' | 'gemini' | 'complete'>('idle');
  const [clipboardFidelity, setClipboardFidelity] = useState<'high' | 'medium' | 'ocr' | 'low_vml' | 'low' | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastReconstruct, setLastReconstruct] = useState<ReconstructResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconstructTimer = useRef<ReturnType<typeof setTimeout>>();
  const { fetchChapters } = useDataStore();

  const isMcq = subtype === 'mcq_single' || subtype === 'mcq_multiple';
  const filteredChapters = chapters.filter((c) => c.subject_id === subjectId);

  const selectSubtype = (val: EditorSubtype) => {
    setSubtype(val);
    setAutosaveStatus('saving');
  };

  useEffect(() => {
    if (subjectId) fetchChapters(subjectId);
    else setChapterId('');
  }, [subjectId, fetchChapters]);

  useEffect(() => {
    if (!initial?.id) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const d = JSON.parse(draft);
          setBodyHtml(d.bodyHtml || '');
          setBodyPlain(d.bodyPlain || '');
          setQuestionImages(d.questionImages || []);
          setOptions(d.options || defaultOptions());
          setSubtype(d.subtype || 'mcq_single');
          setSubjectId(d.subjectId || '');
          setExamTypeId(d.examTypeId || '');
          setOcrText(d.ocrText || '');
        } catch {
          /* ignore */
        }
      }
      return;
    }
    const text = initial.question_text || '';
    setBodyHtml(text);
    setBodyPlain(text.replace(/<[^>]+>/g, ' '));
    setQuestionLatex(initial.question_latex || '');
    setQuestionImages(initial.question_images || []);
    setOptions(
      (initial.options as QuestionOption[])?.length
        ? (initial.options as QuestionOption[])
        : defaultOptions()
    );
    setExplanation(initial.explanation || '');
    setClassLevel(initial.class || 11);
    setSubjectId(initial.subject_id || '');
    setChapterId(initial.chapter_id || '');
    setExamTypeId(initial.exam_type_id || '');
    setDifficulty(initial.difficulty || 'medium');
    setCorrectOption(initial.correct_option ?? 0);
    setNumericalAnswer(
      initial.numerical_answer != null ? String(initial.numerical_answer) : ''
    );
    setTagsInput((initial.tags || []).filter((t) => !SUBTYPE_OPTIONS.some((o) => o.value === t)).join(', '));
    const sub = initial.tags?.find((t) =>
      SUBTYPE_OPTIONS.some((o) => o.value === t)
    ) as EditorSubtype | undefined;
    if (sub) setSubtype(sub);
  }, [initial?.id]);

  const persistDraft = useCallback(() => {
    if (initial?.id) return;
    setAutosaveStatus('saving');
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        bodyHtml,
        bodyPlain,
        questionImages,
        options,
        subtype,
        subjectId,
        examTypeId,
        ocrText,
      })
    );
    setTimeout(() => setAutosaveStatus('saved'), 350);
  }, [initial?.id, bodyHtml, bodyPlain, questionImages, options, subtype, subjectId, examTypeId, ocrText]);

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
          setPipelineState('gemini');

          const result = await runQuestionReconstruction({
            html: rawHtml || payload.html,
            plain: payload.plain,
            ocrText,
            images: payload.images,
            useGemini: true,
            blocks: payload.blocks,
          });
          
          setPipelineState('complete');
          
          applyReconstructResult(result, {
            setBodyHtml,
            setBodyPlain,
            setQuestionLatex,
            setQuestionImages,
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
            result.sources.gemini && 'Gemini',
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
  }, [options.length, subtype, bodyHtml, bodyPlain, subjectId, examTypeId, correctOption, numericalAnswer, explanation, classLevel, chapterId, tagsInput, difficulty]);

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
    if (!subjectId) errs.push('Subject is required');
    if (!examTypeId) errs.push('Exam type is required');
    if (isMcq) {
      const filled = options.filter((o) => o.text?.trim()).length;
      if (filled < 2) errs.push('MCQ needs at least 2 options');
      if (subtype === 'mcq_single' && correctOption === null) errs.push('Select correct option');
    }
    return errs;
  };

  const buildPayload = (): Record<string, unknown> => {
    const sub = SUBTYPE_OPTIONS.find((s) => s.value === subtype)!;
    const displayText = bodyHtml.trim() || autoWrapEquations(bodyPlain.trim());
    const autoLatex = extractPrimaryLatex(displayText);
    const tags = [
      subtype,
      ...tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
    ];
    return {
      question_text: displayText,
      question_latex: questionLatex.trim() || autoLatex || null,
      question_images: questionImages,
      question_type: sub.questionType,
      class: classLevel,
      subject_id: subjectId,
      chapter_id: chapterId || null,
      exam_type_id: examTypeId,
      difficulty,
      marks: 4,
      options: isMcq ? options.filter((o) => o.text?.trim()) : [],
      correct_option: isMcq ? correctOption : null,
      numerical_answer:
        sub.questionType === 'numerical' && numericalAnswer
          ? Number(numericalAnswer)
          : null,
      explanation: explanation.trim() || null,
      tags: [...new Set(tags)],
      status: 'pending',
      source: 'manual',
      has_diagram: questionImages.length > 0,
      has_equation: Boolean(questionLatex || autoLatex || /\$/.test(displayText)),
    };
  };

  const previewQuestion: Question = {
    id: 'preview',
    question_text: bodyPlain.trim() || bodyHtml,
    question_latex: questionLatex || extractPrimaryLatex(bodyHtml || bodyPlain) || null,
    question_type: SUBTYPE_OPTIONS.find((s) => s.value === subtype)!.questionType,
    question_images: questionImages,
    options: isMcq ? options.filter((o) => o.text?.trim()) : [],
    option_images: {},
    correct_option: correctOption,
    numerical_answer: numericalAnswer ? Number(numericalAnswer) : null,
    numerical_tolerance: 0,
    answer_text: null,
    difficulty,
    marks: 4,
    class: classLevel,
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
    subject_id: subjectId,
    chapter_id: chapterId,
    exam_type_id: examTypeId,
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
      if (!initial?.id) localStorage.removeItem(DRAFT_KEY);
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

        <Card className="p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Paste & reconstruct</h3>
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
              {reconstructing ? 'Working…' : 'Auto-detect · OCR · Gemini'}
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

          <RichQuestionEditor
            value={bodyHtml}
            images={questionImages}
            ocrText={ocrText}
            onOcrTextChange={setOcrText}
            onChange={(html, plain) => {
              setBodyHtml(html);
              setBodyPlain(plain);
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

        {isMcq && (
          <Card className="p-3 space-y-2">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Options</h3>
            <OptionRichFields
              options={options}
              subtype={subtype as 'mcq_single' | 'mcq_multiple'}
              correctOption={correctOption}
              onOptionsChange={(opts) => {
                setOptions(opts);
                setAutosaveStatus('saving');
              }}
              onCorrectChange={(idx) => {
                setCorrectOption(idx);
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

        <Card className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Select
            label="Class"
            value={String(classLevel)}
            onChange={(e) => {
              setClassLevel(Number(e.target.value));
              setAutosaveStatus('saving');
            }}
            options={[6, 7, 8, 9, 10, 11, 12].map((c) => ({ value: String(c), label: `Class ${c}` }))}
            className="py-1 text-xs"
          />
          <Select
            label="Subject"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setChapterId('');
              setAutosaveStatus('saving');
            }}
            options={[{ value: '', label: 'Select…' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
            className="py-1 text-xs"
          />
          <Select
            label="Chapter / topic"
            value={chapterId}
            onChange={(e) => {
              setChapterId(e.target.value);
              setAutosaveStatus('saving');
            }}
            options={[
              {
                value: '',
                label: !subjectId
                  ? 'Select subject first'
                  : filteredChapters.length
                    ? 'No chapter (optional)'
                    : 'Loading chapters…',
              },
              ...filteredChapters.map((c) => ({
                value: c.id,
                label: c.chapter_number != null ? `${c.chapter_number}. ${c.name}` : c.name,
              })),
            ]}
            className="py-1 text-xs"
          />
          <Select
            label="Exam"
            value={examTypeId}
            onChange={(e) => {
              setExamTypeId(e.target.value);
              setAutosaveStatus('saving');
            }}
            options={[{ value: '', label: 'Select…' }, ...examTypes.map((e) => ({ value: e.id, label: e.name }))]}
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
