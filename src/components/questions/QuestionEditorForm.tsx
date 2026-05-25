import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Card, Alert, Badge } from '../ui';
import { LatexToolbar } from './LatexToolbar';
import { RichQuestionEditor } from './RichQuestionEditor';
import { ReconstructionPreview } from './ReconstructionPreview';
import { OptionRichFields } from './OptionRichFields';
import type { Question, QuestionOption, QuestionType } from '../../types';
import type { EditorSubtype } from '../../utils/questionPasteDetect';
import {
  runQuestionReconstruction,
  type ReconstructResult,
} from '../../utils/questionReconstruct';
import { autoWrapEquations, extractPrimaryLatex } from '../../utils/equationAutoWrap';
import { useDataStore } from '../../stores/dataStore';

const DRAFT_KEY = 'examforge_question_draft';

interface QuestionEditorFormProps {
  initial?: Partial<Question>;
  subjects: Array<{ id: string; name: string }>;
  chapters: Array<{ id: string; name: string; subject_id: string }>;
  examTypes: Array<{ id: string; name: string }>;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

const SUBTYPE_OPTIONS: { value: EditorSubtype; label: string; questionType: QuestionType }[] = [
  { value: 'mcq_single', label: 'MCQ (single correct)', questionType: 'mcq' },
  { value: 'mcq_multiple', label: 'MCQ (multiple correct)', questionType: 'mcq' },
  { value: 'integer', label: 'Integer answer', questionType: 'numerical' },
  { value: 'numerical', label: 'Numerical', questionType: 'numerical' },
  { value: 'descriptive', label: 'Descriptive', questionType: 'descriptive' },
  { value: 'comprehension', label: 'Comprehension', questionType: 'descriptive' },
  { value: 'match_following', label: 'Match the following', questionType: 'descriptive' },
];

function defaultOptions(): QuestionOption[] {
  return [
    { text: '', latex: null },
    { text: '', latex: null },
    { text: '', latex: null },
    { text: '', latex: null },
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
  if (result.options.length >= 2) {
    setters.setOptions(result.options);
  } else if (result.options.length) {
    setters.setOptions([
      ...result.options,
      ...defaultOptions().slice(result.options.length),
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
  const [lastReconstruct, setLastReconstruct] = useState<ReconstructResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconstructTimer = useRef<ReturnType<typeof setTimeout>>();
  const { fetchChapters } = useDataStore();

  const isMcq = subtype === 'mcq_single' || subtype === 'mcq_multiple';
  const filteredChapters = chapters.filter((c) => c.subject_id === subjectId);

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
  }, [initial?.id, bodyHtml, bodyPlain, questionImages, options, subtype, subjectId, examTypeId, ocrText]);

  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(persistDraft, 800);
    return () => clearTimeout(autosaveTimer.current);
  }, [persistDraft]);

  const triggerReconstruction = useCallback(
    (payload: { html: string; plain: string; images: string[] }) => {
      if (reconstructTimer.current) clearTimeout(reconstructTimer.current);
      reconstructTimer.current = setTimeout(async () => {
        const plainLen = (payload.plain || payload.html?.replace(/<[^>]+>/g, ' ') || '').trim().length;
        if (plainLen < 12 && !payload.images.length && !ocrText.trim()) return;

        setReconstructing(true);
        try {
          const result = await runQuestionReconstruction({
            html: payload.html,
            plain: payload.plain,
            ocrText,
            images: payload.images,
            useGemini: true,
          });
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
        } finally {
          setReconstructing(false);
        }
      }, 600);
    },
    [ocrText]
  );

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
      correct_option: isMcq && subtype === 'mcq_single' ? correctOption : null,
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
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_minmax(300px,380px)] gap-4 xl:gap-6">
      <div className="space-y-3 min-w-0 order-2 xl:order-1">
        {errors.length > 0 && (
          <Alert variant="error" title="Fix before publishing">
            <ul className="list-disc pl-4 text-sm">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}

        <Card className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">Paste & reconstruct</h3>
            <Badge variant="info">
              {reconstructing ? 'Working…' : 'Auto-detect · OCR · Gemini'}
            </Badge>
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
            }}
            onImagesChange={setQuestionImages}
            onPastePayload={triggerReconstruction}
          />
          <details
            className="rounded-lg border border-slate-200 dark:border-slate-600"
            open={showAdvancedMath}
            onToggle={(e) => setShowAdvancedMath((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              Advanced equation tools
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <LatexToolbar onInsert={insertLatex} />
              <Input
                label="Display LaTeX override (optional)"
                value={questionLatex}
                onChange={(e) => setQuestionLatex(e.target.value)}
                placeholder="Auto-detected from $...$ in content"
              />
            </div>
          </details>
        </Card>

        <Card className="p-3 sm:p-4">
          <Select
            label="Question type (override)"
            value={subtype}
            onChange={(e) => setSubtype(e.target.value as EditorSubtype)}
            options={SUBTYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Card>

        {isMcq && (
          <Card className="p-3 sm:p-4 space-y-2">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Options</h3>
            <OptionRichFields
              options={options}
              subtype={subtype}
              correctOption={correctOption}
              onOptionsChange={setOptions}
              onCorrectChange={setCorrectOption}
            />
          </Card>
        )}

        {(subtype === 'integer' || subtype === 'numerical') && (
          <Card className="p-3 sm:p-4">
            <Input
              label="Answer"
              type="number"
              step="any"
              value={numericalAnswer}
              onChange={(e) => setNumericalAnswer(e.target.value)}
            />
          </Card>
        )}

        <Card className="p-3 sm:p-4">
          <Input
            label="Explanation (optional)"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        </Card>

        <Card className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Select
            label="Class"
            value={String(classLevel)}
            onChange={(e) => setClassLevel(Number(e.target.value))}
            options={[6, 7, 8, 9, 10, 11, 12].map((c) => ({ value: String(c), label: `Class ${c}` }))}
          />
          <Select
            label="Subject"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setChapterId('');
            }}
            options={[{ value: '', label: 'Select…' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
          />
          <Select
            label="Chapter / topic"
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
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
          />
          <Select
            label="Exam"
            value={examTypeId}
            onChange={(e) => setExamTypeId(e.target.value)}
            options={[{ value: '', label: 'Select…' }, ...examTypes.map((e) => ({ value: e.id, label: e.name }))]}
          />
          <Select
            label="Difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'medium', label: 'Medium' },
              { value: 'hard', label: 'Hard' },
            ]}
          />
          <Input
            label="Tags"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="col-span-2 sm:col-span-3"
            placeholder="comma-separated"
          />
        </Card>

        <div className="flex flex-wrap gap-2 pb-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="ghost"
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
          <Button variant="ghost" onClick={() => handleSubmit(true)} disabled={isSaving}>
            Save draft
          </Button>
          <Button onClick={() => handleSubmit(false)} disabled={isSaving}>
            {isSaving ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </div>

      <div className="xl:sticky xl:top-2 h-fit space-y-2 order-1 xl:order-2 max-h-[calc(100dvh-5rem)] overflow-y-auto">
        <Card className="p-3 sm:p-4">
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
            />
          )}
        </Card>
      </div>
    </div>
  );
}
