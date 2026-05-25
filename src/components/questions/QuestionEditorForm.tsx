import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input, Select, Textarea, Card, Alert, Badge } from '../ui';
import { LatexToolbar } from './LatexToolbar';
import { QuestionContentPreview } from '../content/RichContent';
import type { Question, QuestionOption, QuestionType } from '../../types';

const DRAFT_KEY = 'examforge_question_draft';

export type EditorSubtype =
  | 'mcq_single'
  | 'mcq_multiple'
  | 'integer'
  | 'numerical'
  | 'descriptive'
  | 'comprehension'
  | 'match_following';

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
    { text: '', latex: null, image: undefined },
    { text: '', latex: null, image: undefined },
    { text: '', latex: null, image: undefined },
    { text: '', latex: null, image: undefined },
  ];
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
  const [questionText, setQuestionText] = useState('');
  const [questionLatex, setQuestionLatex] = useState('');
  const [options, setOptions] = useState<QuestionOption[]>(defaultOptions());
  const [explanation, setExplanation] = useState('');
  const [classLevel, setClassLevel] = useState(11);
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [examTypeId, setExamTypeId] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [marks, setMarks] = useState(4);
  const [correctOption, setCorrectOption] = useState<number | null>(0);
  const [numericalAnswer, setNumericalAnswer] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<'pending' | 'needs_review'>('pending');
  const [showPreview, setShowPreview] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const isMcq = subtype === 'mcq_single' || subtype === 'mcq_multiple';
  const filteredChapters = chapters.filter((c) => c.subject_id === subjectId);

  useEffect(() => {
    if (!initial?.id) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const d = JSON.parse(draft);
          setQuestionText(d.questionText || '');
          setQuestionLatex(d.questionLatex || '');
          setOptions(d.options || defaultOptions());
          setSubtype(d.subtype || 'mcq_single');
        } catch {
          /* ignore */
        }
      }
      return;
    }
    setQuestionText(initial.question_text || '');
    setQuestionLatex(initial.question_latex || '');
    setOptions((initial.options as QuestionOption[])?.length ? (initial.options as QuestionOption[]) : defaultOptions());
    setExplanation(initial.explanation || '');
    setClassLevel(initial.class || 11);
    setSubjectId(initial.subject_id || '');
    setChapterId(initial.chapter_id || '');
    setExamTypeId(initial.exam_type_id || '');
    setDifficulty(initial.difficulty || 'medium');
    setMarks(initial.marks || 4);
    setCorrectOption(initial.correct_option ?? 0);
    setTagsInput((initial.tags || []).join(', '));
    const sub = initial.tags?.find((t) =>
      SUBTYPE_OPTIONS.some((o) => o.value === t)
    ) as EditorSubtype | undefined;
    if (sub) setSubtype(sub);
  }, [initial?.id]);

  const persistDraft = useCallback(() => {
    if (initial?.id) return;
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ questionText, questionLatex, options, subtype })
    );
  }, [initial?.id, questionText, questionLatex, options, subtype]);

  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(persistDraft, 800);
    return () => clearTimeout(autosaveTimer.current);
  }, [persistDraft]);

  const insertLatex = (snippet: string) => {
    setQuestionText((t) => (t ? `${t} ${snippet}` : snippet));
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (questionText.trim().length < 5) errs.push('Question text is required (min 5 characters)');
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
    const tags = [
      subtype,
      ...tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
    ];
    return {
      question_text: questionText.trim(),
      question_latex: questionLatex.trim() || null,
      question_type: sub.questionType,
      class: classLevel,
      subject_id: subjectId,
      chapter_id: chapterId || null,
      exam_type_id: examTypeId,
      difficulty,
      marks,
      options: isMcq ? options.filter((o) => o.text?.trim()) : [],
      correct_option: isMcq && subtype === 'mcq_single' ? correctOption : null,
      numerical_answer:
        sub.questionType === 'numerical' && numericalAnswer
          ? Number(numericalAnswer)
          : null,
      explanation: explanation.trim() || null,
      tags: [...new Set(tags)],
      status,
      source: 'manual',
    };
  };

  const previewQuestion: Question = {
    id: 'preview',
    question_text: questionText,
    question_latex: questionLatex || null,
    question_type: SUBTYPE_OPTIONS.find((s) => s.value === subtype)!.questionType,
    question_images: [],
    options: isMcq ? options : [],
    option_images: {},
    correct_option: correctOption,
    numerical_answer: null,
    numerical_tolerance: 0,
    answer_text: null,
    difficulty,
    marks,
    class: classLevel,
    explanation: explanation || null,
    explanation_latex: null,
    explanation_images: [],
    diagrams: [],
    has_diagram: false,
    has_equation: Boolean(questionLatex || /\$/.test(questionText)),
    tags: [],
    ai_confidence: 0,
    ai_metadata: { provider: 'manual', latexFirst: true },
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
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-4 min-w-0">
        {errors.length > 0 && (
          <Alert variant="error" title="Fix before publishing">
            <ul className="list-disc pl-4 text-sm">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}

        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-slate-900 dark:text-white">Question type</h3>
          <Select
            value={subtype}
            onChange={(e) => setSubtype(e.target.value as EditorSubtype)}
            options={SUBTYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">Question body</h3>
            <Badge variant="info">LaTeX-first</Badge>
          </div>
          <LatexToolbar onInsert={insertLatex} />
          <Textarea
            label="Text (use $...$ for inline, $$...$$ for block math)"
            rows={6}
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
          />
          <Input
            label="Primary LaTeX (optional block equation)"
            value={questionLatex}
            onChange={(e) => setQuestionLatex(e.target.value)}
            placeholder="e.g. \\int_0^1 x^2 dx"
          />
        </Card>

        {isMcq && (
          <Card className="p-4 space-y-3">
            <h3 className="font-semibold text-slate-900 dark:text-white">Options</h3>
            {options.map((opt, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <span className="font-medium pt-2 w-6">{String.fromCharCode(65 + idx)}.</span>
                <div className="flex-1 space-y-1">
                  <Input
                    value={opt.text}
                    onChange={(e) => {
                      const next = [...options];
                      next[idx] = { ...next[idx], text: e.target.value };
                      setOptions(next);
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                  />
                  <Input
                    value={opt.latex || ''}
                    onChange={(e) => {
                      const next = [...options];
                      next[idx] = { ...next[idx], latex: e.target.value || undefined };
                      setOptions(next);
                    }}
                    placeholder="Option LaTeX (optional)"
                    className="text-sm"
                  />
                </div>
                {subtype === 'mcq_single' && (
                  <input
                    type="radio"
                    name="correct"
                    checked={correctOption === idx}
                    onChange={() => setCorrectOption(idx)}
                    className="mt-3"
                    title="Correct answer"
                  />
                )}
              </div>
            ))}
          </Card>
        )}

        {(subtype === 'integer' || subtype === 'numerical') && (
          <Card className="p-4">
            <Input
              label="Numerical / integer answer"
              type="number"
              step="any"
              value={numericalAnswer}
              onChange={(e) => setNumericalAnswer(e.target.value)}
            />
          </Card>
        )}

        <Card className="p-4 space-y-3">
          <Textarea
            label="Explanation (optional)"
            rows={3}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        </Card>

        <Card className="p-4 grid grid-cols-2 gap-3">
          <Select
            label="Class"
            value={String(classLevel)}
            onChange={(e) => setClassLevel(Number(e.target.value))}
            options={[6, 7, 8, 9, 10, 11, 12].map((c) => ({ value: String(c), label: `Class ${c}` }))}
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
              { value: '', label: 'Optional' },
              ...filteredChapters.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Select
            label="Exam type"
            value={examTypeId}
            onChange={(e) => setExamTypeId(e.target.value)}
            options={[{ value: '', label: 'Select…' }, ...examTypes.map((e) => ({ value: e.id, label: e.name }))]}
          />
          <Input
            label="Marks"
            type="number"
            min={1}
            value={String(marks)}
            onChange={(e) => setMarks(Number(e.target.value) || 4)}
          />
          <Input
            label="Tags (comma-separated)"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="col-span-2"
          />
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="ghost" onClick={() => handleSubmit(true)} disabled={isSaving}>
            Save draft
          </Button>
          <Button onClick={() => handleSubmit(false)} disabled={isSaving}>
            {isSaving ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </div>

      <div className="xl:sticky xl:top-20 h-fit space-y-3">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900 dark:text-white">Live preview</h3>
            <Button size="sm" variant="ghost" onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showPreview && <QuestionContentPreview question={previewQuestion} />}
        </Card>
        {questionText.length > 30 && (
          <p className="text-xs text-slate-500">
            Tip: Use the toolbar for fractions, integrals, and matrices. Equations render with{' '}
            {import.meta.env.VITE_MATH_RENDERER || 'MathJax'}.
          </p>
        )}
      </div>
    </div>
  );
}
