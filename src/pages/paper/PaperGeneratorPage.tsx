import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDataStore } from '../../stores/dataStore';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchPaperApi,
  fetchPaperPoolStatsApi,
  selectQuestionsForPaperApi,
  downloadPaperPdfApi,
  type PoolStats,
} from '../../api/papers';
import { downloadBlob } from '../../utils/downloadBlob';
import { getApiErrorMessage } from '../../api/client';
import toast from 'react-hot-toast';
import { Card, Button, Input, Select, Badge, Alert, Modal, EmptyState, MultiSelect } from '../../components/ui';
import { Plus, Wand2, Settings, Save, Sparkles, Download } from 'lucide-react';
import type { Question } from '../../types';
import {
  SortableSectionQuestions,
  type SelectedQuestion,
} from '../../components/paper/SortableSectionQuestions';
import { QuestionContentPreview } from '../../components/content/RichContent';
import {
  DEFAULT_SECTIONS,
  applySelectionToSections,
  buildSelectPayload,
  buildPoolStatsPayload,
  validateSectionsLocally,
  paperToSections,
  type Section,
  type PaperBuilderFilters,
} from './paperBuilderUtils';

export function PaperGeneratorPage() {
  const navigate = useNavigate();
  const { paperId } = useParams();
  const isEditMode = Boolean(paperId);
  const { profile, canGeneratePapers } = useAuth();
  const {
    subjects, examTypes, chapters, questions,
    fetchSubjects, fetchExamTypes, fetchChapters, fetchQuestions, createPaper, updatePaper,
  } = useDataStore();

  const [isLoading, setIsLoading] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [paperStatus, setPaperStatus] = useState<'draft' | 'published'>('draft');
  const [isExporting, setIsExporting] = useState(false);

  const [title, setTitle] = useState('');
  const [examTypeId, setExamTypeId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [classLevel, setClassLevel] = useState<number>(11);
  const [totalMarks, setTotalMarks] = useState<number>(100);
  const [duration, setDuration] = useState<number>(180);
  const [difficultyDistribution, setDifficultyDistribution] = useState({ easy: 30, medium: 50, hard: 20 });

  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS.map((s) => ({ ...s, questions: [] })));

  const [showAddModal, setShowAddModal] = useState(false);
  const [currentSectionId, setCurrentSectionId] = useState<string>('A');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [builderFilters, setBuilderFilters] = useState<PaperBuilderFilters>({
    subjectIds: [],
    examTypeIds: [],
    classLevels: [],
    chapterIds: [],
    difficulties: [],
  });

  const filterPayload = useMemo(
    () => ({
      subjectId,
      examTypeId,
      classLevel,
      filters: builderFilters,
    }),
    [subjectId, examTypeId, classLevel, builderFilters]
  );

  useEffect(() => {
    fetchSubjects();
    fetchExamTypes();
    fetchQuestions({ status: 'approved' });
  }, []);

  useEffect(() => {
    if (subjectId) fetchChapters(subjectId);
  }, [subjectId]);

  useEffect(() => {
    if (!subjectId) {
      setPoolStats(null);
      return;
    }
    const timer = setTimeout(async () => {
      setPoolLoading(true);
      try {
        const stats = await fetchPaperPoolStatsApi(buildPoolStatsPayload(filterPayload));
        setPoolStats(stats);
      } catch {
        setPoolStats(null);
      } finally {
        setPoolLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [filterPayload]);

  useEffect(() => {
    if (!paperId) return;
    (async () => {
      setIsLoading(true);
      try {
        const paper = await fetchPaperApi(paperId);
        setTitle(paper.title);
        setExamTypeId(paper.exam_type_id || '');
        setSubjectId(paper.subject_id || '');
        setClassLevel(paper.class);
        setTotalMarks(paper.total_marks);
        setDuration(paper.duration_minutes);
        setPaperStatus(paper.status === 'published' ? 'published' : 'draft');
        setSections(paperToSections(paper));
      } catch {
        navigate('/papers');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [paperId]);

  const currentSection = sections.find((s) => s.id === currentSectionId);
  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);
  const computedMarks = sections.reduce(
    (sum, s) => sum + s.questions.reduce((m, q) => m + Number(q.customMarks || 0), 0),
    0
  );

  const usedQuestionIds = useMemo(
    () => new Set(sections.flatMap((s) => s.questions.map((q) => q.id))),
    [sections]
  );

  const availableQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (usedQuestionIds.has(q.id)) return false;
      if (builderFilters.subjectIds.length && q.subject_id && !builderFilters.subjectIds.includes(q.subject_id)) return false;
      else if (subjectId && q.subject_id !== subjectId) return false;
      if (builderFilters.classLevels.length && !builderFilters.classLevels.includes(q.class)) return false;
      else if (classLevel && q.class !== classLevel) return false;
      if (builderFilters.difficulties.length && !builderFilters.difficulties.includes(q.difficulty)) return false;
      else if (selectedDifficulty && q.difficulty !== selectedDifficulty) return false;
      if (builderFilters.chapterIds.length && q.chapter_id && !builderFilters.chapterIds.includes(q.chapter_id)) return false;
      if (builderFilters.examTypeIds.length && q.exam_type_id && !builderFilters.examTypeIds.includes(q.exam_type_id)) return false;
      if (searchTerm && !q.question_text.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [questions, subjectId, classLevel, selectedDifficulty, searchTerm, usedQuestionIds, builderFilters]);

  const requiredQuestions = sections.reduce((s, sec) => s + sec.targetCount, 0);
  const poolTooSmall = poolStats != null && poolStats.total < requiredQuestions;

  const runIntelligentSelect = async (preserveOrder = false) => {
    if (!subjectId || !examTypeId) {
      alert('Please select subject and exam type first');
      return;
    }
    setIsSelecting(true);
    try {
      const selection = await selectQuestionsForPaperApi(
        buildSelectPayload(sections, {
          subjectId,
          examTypeId,
          classLevel,
          totalMarks,
          excludeIds: [],
          difficultyDistribution,
          filters: builderFilters,
        })
      );
      setSections(applySelectionToSections(sections, selection, preserveOrder));
      const warnings = [...(selection.validation?.warnings || [])];
      if (selection.pool_stats && selection.pool_stats.total < requiredQuestions) {
        warnings.push(`Pool has only ${selection.pool_stats.total} questions; paper needs ${requiredQuestions}`);
      }
      setValidationWarnings(warnings);
      if (selection.pool_stats) setPoolStats(selection.pool_stats);
      if (!preserveOrder) {
        setTotalMarks(selection.total_marks);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Selection failed';
      alert(message);
    } finally {
      setIsSelecting(false);
    }
  };

  const replaceQuestion = async (sectionId: string, questionId: string) => {
    if (!subjectId) return;
    setReplacingId(questionId);
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    try {
      const selection = await selectQuestionsForPaperApi({
        ...buildSelectPayload(sections, {
          subjectId,
          examTypeId,
          classLevel,
          totalMarks,
          excludeIds: [...usedQuestionIds],
          difficultyDistribution,
          filters: builderFilters,
        }),
        sections: [
          {
            id: sectionId,
            name: section.name,
            questionCount: 1,
            marksPerQuestion: section.marksPerQuestion,
            question_types: section.questionTypes,
          },
        ],
      });
      const replacement = selection.sections[0]?.questions[0] as unknown as Question | undefined;
      if (!replacement) {
        alert('No replacement question available');
        return;
      }

      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          return {
            ...s,
            questions: s.questions.map((q) =>
              q.id === questionId
                ? {
                    ...(replacement as Question),
                    customMarks: q.customMarks,
                    sectionId,
                    orderIndex: q.orderIndex,
                  }
                : q
            ),
          };
        })
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not replace question');
    } finally {
      setReplacingId(null);
    }
  };

  const addQuestionToSection = (question: Question) => {
    if (!currentSection) return;
    setSections((prev) =>
      prev.map((s) => {
        if (s.id === currentSectionId) {
          const newQ: SelectedQuestion = {
            ...question,
            customMarks: s.marksPerQuestion,
            sectionId: s.id,
            orderIndex: s.questions.length,
          };
          return { ...s, questions: [...s.questions, newQ] };
        }
        return s;
      })
    );
    setShowAddModal(false);
  };

  const removeQuestionFromSection = (sectionId: string, questionId: string) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id === sectionId) {
          const filtered = s.questions.filter((q) => q.id !== questionId);
          return { ...s, questions: filtered.map((q, i) => ({ ...q, orderIndex: i })) };
        }
        return s;
      })
    );
  };

  const reorderSectionQuestions = (sectionId: string, reordered: SelectedQuestion[]) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, questions: reordered } : s)));
  };

  const updateQuestionMarks = (sectionId: string, questionId: string, marks: number) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          questions: s.questions.map((q) => (q.id === questionId ? { ...q, customMarks: marks } : q)),
        };
      })
    );
  };

  const updateQuestionNegativeMarks = (sectionId: string, questionId: string, negMarks: number | null) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          questions: s.questions.map((q) => (q.id === questionId ? { ...q, customNegativeMarks: negMarks } : q)),
        };
      })
    );
  };

  const handleExportPdf = async () => {
    if (!paperId) return;
    setIsExporting(true);
    try {
      const blob = await downloadPaperPdfApi(paperId, {
        allowDraft: paperStatus === 'draft',
      });
      downloadBlob(blob, `${title || 'paper'}.pdf`);
      toast.success('PDF exported');
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setIsExporting(false);
    }
  };

  const handleSavePaper = async (status: 'draft' | 'published' = paperStatus) => {
    if (!title || !subjectId || !examTypeId) {
      alert('Please fill all required fields');
      return;
    }
    if (totalQuestions === 0) {
      alert('Please add at least one question');
      return;
    }

    const localValidation = validateSectionsLocally(sections, totalMarks);
    setValidationWarnings(localValidation.warnings);

    setIsLoading(true);
    try {
      const paperQuestions = sections.flatMap((s) =>
        s.questions.map((q, index) => ({
          question_id: q.id,
          section: s.id,
          section_order: sections.indexOf(s),
          question_order: index,
          custom_marks: q.customMarks,
          custom_negative_marks: q.customNegativeMarks ?? null,
        }))
      );

      const payload = {
        title,
        description: `${examTypes.find((e) => e.id === examTypeId)?.name} - ${subjects.find((s) => s.id === subjectId)?.name}`,
        exam_type_id: examTypeId,
        subject_id: subjectId,
        class: classLevel,
        total_marks: computedMarks,
        total_questions: totalQuestions,
        duration_minutes: duration,
        is_online: false,
        status,
        created_by: profile?.id || '',
        sections: sections.map((s) => ({
          name: s.name,
          questionCount: s.questions.length,
          marksPerQuestion: s.marksPerQuestion,
          negativeMarksPerQuestion: s.negativeMarksPerQuestion || 0,
        })),
        questions: paperQuestions,
      };

      if (isEditMode && paperId) {
        const { error } = await updatePaper(paperId, payload);
        if (error) throw error;
      } else {
        const paperCode = `PAPER-${Date.now().toString(36).toUpperCase()}`;
        const { error } = await createPaper({ ...payload, paper_code: paperCode });
        if (error) throw error;
      }

      navigate('/papers');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Save failed';
      alert(`Failed to save paper: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!canGeneratePapers) {
    return (
      <Alert variant="error" title="Access Denied">
        You don't have permission to generate papers.
      </Alert>
    );
  }

  if (isEditMode && isLoading && !title) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isEditMode ? 'Edit Question Paper' : 'Generate Question Paper'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {isEditMode ? 'Update draft or published paper' : 'Create exam papers from approved questions'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="ghost" onClick={() => navigate('/papers')}>Cancel</Button>
          <Select
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
            ]}
            value={paperStatus}
            onChange={(e) => setPaperStatus(e.target.value as 'draft' | 'published')}
            className="w-32"
          />
          {isEditMode && paperId && (
            <Button
              variant="outline"
              onClick={() => void handleExportPdf()}
              isLoading={isExporting}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Export PDF
            </Button>
          )}
          <Button variant="outline" onClick={() => handleSavePaper('draft')} isLoading={isLoading}>
            Save Draft
          </Button>
          <Button onClick={() => handleSavePaper(paperStatus)} isLoading={isLoading} leftIcon={<Save className="w-4 h-4" />}>
            {isEditMode ? 'Update Paper' : 'Save Paper'}
          </Button>
        </div>
      </div>

      {validationWarnings.length > 0 && (
        <Alert variant="warning" title="Validation notes">
          <ul className="list-disc pl-5 text-sm mt-1">
            {validationWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 p-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Paper Configuration
          </h2>

          <div className="space-y-4">
            <Input label="Paper Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Select
              label="Exam Type"
              options={examTypes.map((e) => ({ value: e.id, label: e.name }))}
              value={examTypeId}
              onChange={(e) => setExamTypeId(e.target.value)}
              placeholder="Select exam type"
            />
            <Select
              label="Subject"
              options={subjects.map((s) => ({ value: s.id, label: s.name }))}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="Select subject"
            />
            <Select
              label="Class"
              options={[6, 7, 8, 9, 10, 11, 12].map((c) => ({ value: c.toString(), label: `Class ${c}` }))}
              value={classLevel.toString()}
              onChange={(e) => setClassLevel(parseInt(e.target.value, 10))}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Target Marks"
                type="number"
                value={totalMarks.toString()}
                onChange={(e) => setTotalMarks(parseInt(e.target.value, 10) || 0)}
              />
              <Input
                label="Actual Marks"
                type="number"
                value={computedMarks.toString()}
                disabled
              />
              <Input
                label="Duration (mins)"
                type="number"
                value={duration.toString()}
                onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Difficulty mix (%)</p>
              <div className="grid grid-cols-3 gap-2">
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <Input
                    key={d}
                    label={d}
                    type="number"
                    value={String(difficultyDistribution[d])}
                    onChange={(e) =>
                      setDifficultyDistribution((prev) => ({
                        ...prev,
                        [d]: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => setDifficultyDistribution({ easy: 100, medium: 0, hard: 0 })}>Easy</Button>
                <Button size="sm" variant="ghost" onClick={() => setDifficultyDistribution({ easy: 0, medium: 100, hard: 0 })}>Medium</Button>
                <Button size="sm" variant="ghost" onClick={() => setDifficultyDistribution({ easy: 0, medium: 0, hard: 100 })}>Hard</Button>
                <Button size="sm" variant="ghost" onClick={() => setDifficultyDistribution({ easy: 30, medium: 50, hard: 20 })}>Mixed</Button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Question pool filters</p>
              <MultiSelect
                label="Classes"
                options={[6, 7, 8, 9, 10, 11, 12].map((c) => ({ value: String(c), label: `Class ${c}` }))}
                values={builderFilters.classLevels.map(String)}
                onChange={(vals) =>
                  setBuilderFilters((f) => ({ ...f, classLevels: vals.map((v) => parseInt(v, 10)) }))
                }
              />
              <MultiSelect
                label="Topics / chapters"
                options={chapters.map((c) => ({ value: c.id, label: c.name }))}
                values={builderFilters.chapterIds}
                onChange={(vals) => setBuilderFilters((f) => ({ ...f, chapterIds: vals }))}
              />
              <MultiSelect
                label="Difficulties"
                options={[
                  { value: 'easy', label: 'Easy' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'hard', label: 'Hard' },
                ]}
                values={builderFilters.difficulties}
                onChange={(vals) => setBuilderFilters((f) => ({ ...f, difficulties: vals }))}
              />
              <MultiSelect
                label="Exam types"
                options={examTypes.map((e) => ({ value: e.id, label: e.name }))}
                values={builderFilters.examTypeIds}
                onChange={(vals) => setBuilderFilters((f) => ({ ...f, examTypeIds: vals }))}
              />
              <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 p-3 text-sm">
                {poolLoading ? (
                  <span className="text-slate-500">Counting pool...</span>
                ) : poolStats ? (
                  <div className="space-y-1">
                    <p className="font-medium text-slate-800 dark:text-slate-200">
                      {poolStats.total} questions available
                    </p>
                    <p className="text-xs text-slate-500">
                      Easy {poolStats.by_difficulty.easy} · Medium {poolStats.by_difficulty.medium} · Hard{' '}
                      {poolStats.by_difficulty.hard}
                    </p>
                    {poolTooSmall && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Pool smaller than paper size ({requiredQuestions} needed). Relax filters or reduce sections.
                      </p>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-500">Select subject to see pool size</span>
                )}
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              leftIcon={<Sparkles className="w-4 h-4" />}
              onClick={() => runIntelligentSelect(false)}
              disabled={!subjectId || !examTypeId}
              isLoading={isSelecting}
            >
              Intelligent Auto-Select
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              leftIcon={<Wand2 className="w-4 h-4" />}
              onClick={() => runIntelligentSelect(true)}
              disabled={!subjectId || totalQuestions === 0}
              isLoading={isSelecting}
            >
              Refill (keep order)
            </Button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <h3 className="font-medium text-slate-700 dark:text-slate-300 mb-3">Sections</h3>
            <div className="space-y-3">
              {sections.map((section) => (
                <div key={section.id} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{section.name}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      label="Target Q"
                      value={section.targetCount.toString()}
                      onChange={(e) => {
                        const count = parseInt(e.target.value, 10) || 0;
                        setSections((prev) =>
                          prev.map((s) => (s.id === section.id ? { ...s, targetCount: count } : s))
                        );
                      }}
                      className="h-8 text-xs px-1"
                    />
                    <Input
                      type="number"
                      label="Marks/Q"
                      value={section.marksPerQuestion.toString()}
                      onChange={(e) => {
                        const marks = parseInt(e.target.value, 10) || 0;
                        setSections((prev) =>
                          prev.map((s) => (s.id === section.id ? { ...s, marksPerQuestion: marks } : s))
                        );
                      }}
                      className="h-8 text-xs px-1"
                    />
                    <Input
                      type="number"
                      label="Neg M/Q"
                      value={(section.negativeMarksPerQuestion ?? 0).toString()}
                      onChange={(e) => {
                        const neg = Number(e.target.value) || 0;
                        setSections((prev) =>
                          prev.map((s) => (s.id === section.id ? { ...s, negativeMarksPerQuestion: neg } : s))
                        );
                      }}
                      className="h-8 text-xs px-1"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {section.questions.length} / {section.targetCount} selected
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 dark:text-white">
              Questions ({totalQuestions} selected · {computedMarks} marks)
            </h2>
          </div>

          {sections.every((s) => s.questions.length === 0) ? (
            <EmptyState
              title="No questions added"
              description="Use Intelligent Auto-Select or add questions manually"
              action={
                <Button onClick={() => setShowAddModal(true)} leftIcon={<Plus className="w-4 h-4" />}>
                  Add Questions
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              {sections.map((section) => (
                <div key={section.id}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-slate-700 dark:text-slate-300">{section.name}</h3>
                    <div className="flex items-center gap-3">
                      <Badge>
                        {section.questions.length}/{section.targetCount} Q |{' '}
                        {section.questions.reduce((s, q) => s + q.customMarks, 0)} M
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCurrentSectionId(section.id);
                          setShowAddModal(true);
                        }}
                        leftIcon={<Plus className="w-4 h-4" />}
                      >
                        Add
                      </Button>
                    </div>
                  </div>

                  {section.questions.length > 0 ? (
                    <SortableSectionQuestions
                      sectionId={section.id}
                      questions={section.questions}
                      onReorder={reorderSectionQuestions}
                      onUpdateMarks={updateQuestionMarks}
                      onUpdateNegativeMarks={updateQuestionNegativeMarks}
                      onRemove={removeQuestionFromSection}
                      onReplace={replaceQuestion}
                      replacingId={replacingId}
                    />
                  ) : (
                    <div className="text-center py-6 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                      <p className="text-sm text-slate-500">No questions in this section</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Questions" size="xl">
        <div className="p-6">
          <div className="flex gap-4 mb-4">
            <Select
              label="Section"
              options={sections.map((s) => ({ value: s.id, label: s.name }))}
              value={currentSectionId}
              onChange={(e) => setCurrentSectionId(e.target.value)}
            />
            <Input
              placeholder="Search questions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Select
              placeholder="Difficulty"
              options={[
                { value: '', label: 'All' },
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
            />
          </div>

          {availableQuestions.length === 0 ? (
            <EmptyState title="No questions available" description="Adjust filters or upload more questions" />
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {availableQuestions.map((question) => (
                <div
                  key={question.id}
                  className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer"
                  onClick={() => addQuestionToSection(question)}
                >
                  <div className="flex-1 min-w-0">
                    <QuestionContentPreview question={question} compact />
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge size="sm" variant={question.difficulty === 'easy' ? 'success' : question.difficulty === 'medium' ? 'warning' : 'error'}>
                        {question.difficulty}
                      </Badge>
                      <Badge size="sm">{question.question_type.toUpperCase()}</Badge>
                      {(question.has_diagram || question.question_images?.length) && (
                        <Badge size="sm" variant="info">Figures</Badge>
                      )}
                      {question.has_equation && <Badge size="sm" variant="info">Math</Badge>}
                    </div>
                  </div>
                  <Plus className="w-5 h-5 text-blue-500 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
