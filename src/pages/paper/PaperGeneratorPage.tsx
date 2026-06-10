import React, { useEffect, useState, useMemo } from 'react';
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
import { Card, Button, Input, Select, Badge, Alert, Modal, EmptyState, MultiSelect, PageHeader, Loading } from '../../components/ui';
import { Plus, Wand2, Save, Sparkles, Download, CheckCircle, PlayCircle } from 'lucide-react';
import type { Question } from '../../types';
import {
  SortableSectionQuestions,
  type SelectedQuestion,
} from '../../components/paper/SortableSectionQuestions';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
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
  
  const [currentStep, setCurrentStep] = useState<number>(1);
  
  const [builderFilters, setBuilderFilters] = useState<PaperBuilderFilters>({
    subjectIds: [],
    examTypeIds: [],
    classLevels: [],
    chapterIds: [],
    difficulties: [],
    syllabusExamPatternId: '',
    syllabusClassId: '',
    syllabusSubjectId: '',
    syllabusChapterId: '',
    syllabusTopicId: '',
    syllabusSubtopicId: '',
    bankId: '',
    bankIds: [],
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
      try {
        const stats = await fetchPaperPoolStatsApi(buildPoolStatsPayload(filterPayload));
        setPoolStats(stats);
      } catch {
        setPoolStats(null);
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
        setCurrentStep(5); // Editing goes straight to Preview
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
      if (searchTerm) {
        const term = searchTerm.trim().toLowerCase();
        const idMatch = term.match(/^q-(\d+)$/i);
        const idNum = idMatch ? Number(idMatch[1]) : (/^\d+$/.test(term) ? Number(term) : null);
        const matchesId = idNum !== null && q.serial_id === idNum;
        const matchesText = q.question_text?.toLowerCase().includes(term);
        if (!matchesId && !matchesText) return false;
      }
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
        status: status as any,
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
        const { error } = await updatePaper(paperId, payload as any);
        if (error) throw error;
        toast.success('Paper updated successfully');
      } else {
        const paperCode = `PAPER-${Date.now().toString(36).toUpperCase()}`;
        const { error } = await createPaper({ ...payload, paper_code: paperCode } as any);
        if (error) throw error;
        toast.success('Paper created successfully');
      }

      navigate('/papers');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Save failed';
      alert(`Failed to save paper: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    // Find source section
    let sourceSectionId = '';
    let draggedQuestion: SelectedQuestion | null = null;

    for (const section of sections) {
      const q = section.questions.find((q) => q.id === activeId);
      if (q) {
        sourceSectionId = section.id;
        draggedQuestion = q;
        break;
      }
    }

    if (!draggedQuestion) return;

    // Find target section and target question
    let targetSectionId = '';
    let targetQuestionId = '';

    const targetSectionDirect = sections.find((s) => s.id === overId);
    if (targetSectionDirect) {
      targetSectionId = targetSectionDirect.id;
    } else {
      for (const section of sections) {
        const q = section.questions.find((q) => q.id === overId);
        if (q) {
          targetSectionId = section.id;
          targetQuestionId = q.id;
          break;
        }
      }
    }

    if (!targetSectionId) return;

    // Same section drag
    if (sourceSectionId === targetSectionId) {
      const targetSec = sections.find((s) => s.id === sourceSectionId)!;
      const oldIndex = targetSec.questions.findIndex((q) => q.id === activeId);
      const newIndex = targetQuestionId
        ? targetSec.questions.findIndex((q) => q.id === targetQuestionId)
        : targetSec.questions.length - 1;

      if (oldIndex !== newIndex && oldIndex >= 0 && newIndex >= 0) {
        const reordered = arrayMove(targetSec.questions, oldIndex, newIndex).map((q, i) => ({
          ...q,
          orderIndex: i,
        }));
        reorderSectionQuestions(sourceSectionId, reordered);
      }
      return;
    }

    // Cross section drag
    const sourceSection = sections.find((s) => s.id === sourceSectionId)!;
    const targetSection = sections.find((s) => s.id === targetSectionId)!;

    const newSourceQuestions = sourceSection.questions.filter((q) => q.id !== activeId).map((q, i) => ({
      ...q,
      orderIndex: i,
    }));

    const updatedQuestion: SelectedQuestion = {
      ...draggedQuestion,
      sectionId: targetSectionId,
      customMarks: targetSection.marksPerQuestion,
      customNegativeMarks: targetSection.negativeMarksPerQuestion ?? null,
    };

    let newTargetQuestions = [...targetSection.questions];
    if (targetQuestionId) {
      const targetIndex = targetSection.questions.findIndex((q) => q.id === targetQuestionId);
      newTargetQuestions.splice(targetIndex, 0, updatedQuestion);
    } else {
      newTargetQuestions.push(updatedQuestion);
    }

    newTargetQuestions = newTargetQuestions.map((q, i) => ({
      ...q,
      orderIndex: i,
    }));

    setSections((prev) =>
      prev.map((s) => {
        if (s.id === sourceSectionId) return { ...s, questions: newSourceQuestions };
        if (s.id === targetSectionId) return { ...s, questions: newTargetQuestions };
        return s;
      })
    );
  };

  if (!canGeneratePapers) {
    return (
      <Alert variant="error" title="Access Denied">
        You don't have permission to generate papers.
      </Alert>
    );
  }

  if (isEditMode && isLoading && !title) {
    return <Loading fullScreen text="Loading paper..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditMode ? 'Edit Question Paper' : 'Guided Assessment Builder'}
        subtitle={isEditMode ? 'Modify existing paper layout' : 'Create a complete high-fidelity exam paper in under 3 minutes'}
        actions={
          <div className="flex gap-2 flex-wrap justify-end">
            <Button variant="ghost" onClick={() => navigate('/papers')}>Cancel</Button>
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
          </div>
        }
      />

      {validationWarnings.length > 0 && (
        <Alert variant="warning" title="Blueprint Validation warnings">
          <ul className="list-disc pl-5 text-sm mt-1">
            {validationWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Stepper progress indicator */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm mb-6">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {[
            { step: 1, label: 'Select Template' },
            { step: 2, label: 'Subject & Chapters' },
            { step: 3, label: 'Configure Blueprint' },
            { step: 4, label: 'Generate Paper' },
            { step: 5, label: 'Preview & Adjust' },
            { step: 6, label: 'Export / Test' },
          ].map((item, idx) => (
            <React.Fragment key={item.step}>
              {idx > 0 && (
                <div 
                  className={`flex-1 h-0.5 mx-2 transition-colors duration-300 ${
                    currentStep >= item.step ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                />
              )}
              <button
                onClick={() => {
                  if (item.step < currentStep || (subjectId && examTypeId)) {
                    setCurrentStep(item.step);
                  }
                }}
                className="flex flex-col items-center gap-1.5 focus:outline-none"
                disabled={item.step > currentStep && (!subjectId || !examTypeId)}
              >
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all duration-300 ${
                    currentStep === item.step 
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100 dark:shadow-none' 
                      : currentStep > item.step 
                        ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-600 text-indigo-600' 
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-400'
                  }`}
                >
                  {item.step}
                </div>
                <span 
                  className={`text-[11px] font-semibold hidden md:inline ${
                    currentStep === item.step ? 'text-indigo-600' : 'text-slate-500'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step Contents */}
      <Card className="p-6">
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-2 mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Step 1: Choose an Assessment Template</h3>
              <p className="text-sm text-slate-500">Pick a predefined pattern template aligned with standardized exam schemes.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {examTypes.map((type) => (
                <div
                  key={type.id}
                  onClick={() => {
                    setExamTypeId(type.id);
                    setTitle((prev) => prev || `${type.name} Assessment`);
                    setCurrentStep(2);
                  }}
                  className={`p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-indigo-500 flex flex-col justify-between h-44 ${
                    examTypeId === type.id 
                      ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/20' 
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white text-base">{type.name}</h3>
                    <p className="text-xs text-slate-500 mt-2 line-clamp-3">
                      {type.description || `Create a test matching the standard ${type.name} layout.`}
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Badge variant={examTypeId === type.id ? 'info' : 'default'}>
                      {examTypeId === type.id ? 'Selected' : 'Use Template'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-2 mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Step 2: Select Subject & Syllabus Range</h3>
              <p className="text-sm text-slate-500 font-medium">Narrow down target questions to specific chapters or subjects.</p>
            </div>

            <Select
              label="Select Subject"
              options={subjects.map((s) => ({ value: s.id, label: s.name }))}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="Select subject"
              required
            />
            <Select
              label="Select Class Level"
              options={[6, 7, 8, 9, 10, 11, 12].map((c) => ({ value: c.toString(), label: `Class ${c}` }))}
              value={classLevel.toString()}
              onChange={(e) => setClassLevel(parseInt(e.target.value, 10))}
            />
            {subjectId && (
              <MultiSelect
                label="Filter by Chapters (Optional)"
                options={chapters.map((c) => ({ value: c.id, label: c.name }))}
                values={builderFilters.chapterIds}
                onChange={(vals) => setBuilderFilters((f) => ({ ...f, chapterIds: vals }))}
              />
            )}

            <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="ghost" onClick={() => setCurrentStep(1)}>Back</Button>
              <Button 
                onClick={() => setCurrentStep(3)} 
                disabled={!subjectId}
              >
                Next: Blueprint Configuration
              </Button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center space-y-2 mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Step 3: Configure Assessment Blueprint</h3>
              <p className="text-sm text-slate-500">Tweak assessment limits, duration, and section-wise weightage rules.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="Assessment Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Target Marks"
                  type="number"
                  value={totalMarks.toString()}
                  onChange={(e) => setTotalMarks(parseInt(e.target.value, 10) || 0)}
                />
                <Input
                  label="Duration (minutes)"
                  type="number"
                  value={duration.toString()}
                  onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/30">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2 text-xs uppercase tracking-wider text-slate-500">Difficulty Distribution (%)</h3>
              <div className="grid grid-cols-3 gap-4">
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <Input
                    key={d}
                    label={`${d.toUpperCase()} (%)`}
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
              <div className="flex gap-1.5 mt-3 flex-wrap">
                <Button size="sm" variant="ghost" onClick={() => setDifficultyDistribution({ easy: 100, medium: 0, hard: 0 })}>100% Easy</Button>
                <Button size="sm" variant="ghost" onClick={() => setDifficultyDistribution({ easy: 0, medium: 100, hard: 0 })}>100% Medium</Button>
                <Button size="sm" variant="ghost" onClick={() => setDifficultyDistribution({ easy: 0, medium: 0, hard: 100 })}>100% Hard</Button>
                <Button size="sm" variant="ghost" onClick={() => setDifficultyDistribution({ easy: 30, medium: 50, hard: 20 })}>JEE standard (30/50/20)</Button>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2 text-xs uppercase tracking-wider text-slate-500">Section Blueprint Config</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sections.map((section) => (
                  <div key={section.id} className="p-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl space-y-3 shadow-sm">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{section.name}</p>
                    <div className="space-y-2">
                      <Input
                        type="number"
                        label="Questions"
                        value={section.targetCount.toString()}
                        onChange={(e) => {
                          const count = parseInt(e.target.value, 10) || 0;
                          setSections((prev) =>
                            prev.map((s) => (s.id === section.id ? { ...s, targetCount: count } : s))
                          );
                        }}
                      />
                      <div className="grid grid-cols-2 gap-2">
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
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="ghost" onClick={() => setCurrentStep(2)}>Back</Button>
              <Button onClick={() => setCurrentStep(4)}>Next: Auto-Select</Button>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="max-w-md mx-auto text-center space-y-6 py-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Step 4: Smart Question Extraction</h3>
              <p className="text-sm text-slate-500 mt-1">
                The auto-generation engine will query matching approved questions and build the assessment package.
              </p>
            </div>

            {poolStats && (
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl text-sm space-y-1 text-left border border-slate-100 dark:border-slate-800">
                <p className="font-semibold text-slate-800 dark:text-slate-200">Matching Pool Size:</p>
                <p className="text-slate-600 dark:text-slate-400">{poolStats.total} questions match subject / syllabus criteria.</p>
                {poolTooSmall && (
                  <p className="text-amber-600 dark:text-amber-400 text-xs mt-2">
                    Warning: The matching pool has only {poolStats.total} questions, while the template blueprint requires {requiredQuestions}. Consider relaxing syllabus filters.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button 
                onClick={async () => {
                  await runIntelligentSelect(false);
                  setCurrentStep(5);
                  toast.success("Paper generated successfully!");
                }}
                isLoading={isSelecting}
                className="w-full h-12 text-base"
                leftIcon={<Wand2 className="w-5 h-5" />}
              >
                Auto-Generate Paper
              </Button>
              <Button variant="ghost" onClick={() => setCurrentStep(3)}>Back to Blueprint</Button>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-6">
            <div className="bg-indigo-50 dark:bg-indigo-950/20 p-5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 flex justify-between items-center flex-wrap gap-4">
              <div>
                <h3 className="font-bold text-indigo-950 dark:text-indigo-100 text-base">{title || 'Untitled Assessment'}</h3>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1 font-medium">
                  {totalQuestions} questions · {computedMarks} marks · {duration} minutes duration
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => runIntelligentSelect(true)} 
                  isLoading={isSelecting}
                  leftIcon={<Wand2 className="w-4 h-4" />}
                >
                  Regenerate Section Questions
                </Button>
              </div>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className="space-y-6">
                {sections.map((section) => (
                  <Card key={section.id} className="p-6">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base">{section.name}</h4>
                      <div className="flex items-center gap-3">
                        <Badge>
                          {section.questions.length}/{section.targetCount} Q ·{' '}
                          {section.questions.reduce((s, q) => s + q.customMarks, 0)} Marks
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
                          Manual Add
                        </Button>
                      </div>
                    </div>

                    {section.questions.length === 0 ? (
                      <p className="text-slate-500 text-center py-8 text-sm">No questions in this section. Click auto-generate or manually add.</p>
                    ) : (
                      <SortableSectionQuestions
                        sectionId={section.id}
                        questions={section.questions}
                        onUpdateMarks={updateQuestionMarks}
                        onUpdateNegativeMarks={updateQuestionNegativeMarks}
                        onRemove={removeQuestionFromSection}
                        onReplace={replaceQuestion}
                        replacingId={replacingId}
                      />
                    )}
                  </Card>
                ))}
              </div>
            </DndContext>

            <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="ghost" onClick={() => setCurrentStep(4)} disabled={isEditMode}>Back</Button>
              <Button onClick={() => setCurrentStep(6)}>Next: Publish & Export</Button>
            </div>
          </div>
        )}

        {currentStep === 6 && (
          <div className="max-w-2xl mx-auto space-y-8 py-4">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Step 6: Deploy Assessment</h3>
              <p className="text-sm text-slate-500">Select an execution option below to save, export, or schedule an online test.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Save Draft */}
              <div 
                onClick={() => void handleSavePaper('draft')}
                className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-indigo-600 hover:shadow-md cursor-pointer flex flex-col justify-between h-48 transition-all duration-200"
              >
                <div>
                  <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 w-fit">
                    <Save className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4 text-sm">Save Paper</h4>
                  <p className="text-xs text-slate-500 mt-1">Keep the paper as a draft for modifications later.</p>
                </div>
                <span className="text-xs font-semibold text-indigo-600 block">Save Draft &rarr;</span>
              </div>

              {/* Card 2: Export PDF */}
              <div 
                onClick={async () => {
                  await handleSavePaper('published');
                }}
                className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-indigo-600 hover:shadow-md cursor-pointer flex flex-col justify-between h-48 transition-all duration-200"
              >
                <div>
                  <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 w-fit">
                    <Download className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4 text-sm">Publish & PDF</h4>
                  <p className="text-xs text-slate-500 mt-1">Publish paper and download offline printable PDF template.</p>
                </div>
                <span className="text-xs font-semibold text-teal-600 block">Download PDF &rarr;</span>
              </div>

              {/* Card 3: Create Test */}
              <div 
                onClick={async () => {
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
                      status: 'published' as any,
                      created_by: profile?.id || '',
                      sections: sections.map((s) => ({
                        name: s.name,
                        questionCount: s.questions.length,
                        marksPerQuestion: s.marksPerQuestion,
                        negativeMarksPerQuestion: s.negativeMarksPerQuestion || 0,
                      })),
                      questions: paperQuestions,
                    };

                    let finalPaperId = paperId;
                    if (isEditMode && paperId) {
                      await updatePaper(paperId, payload as any);
                    } else {
                      const paperCode = `PAPER-${Date.now().toString(36).toUpperCase()}`;
                      const response = await createPaper({ ...payload, paper_code: paperCode } as any);
                      if (response.error) throw response.error;
                      finalPaperId = (response.data as any)?.id;
                    }

                    navigate(`/papers?createTestFor=${finalPaperId}`);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Save failed');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-indigo-600 hover:shadow-md cursor-pointer flex flex-col justify-between h-48 transition-all duration-200"
              >
                <div>
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 w-fit">
                    <PlayCircle className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4 text-sm">Create Online Test</h4>
                  <p className="text-xs text-slate-500 mt-1">Schedule this paper immediately as an online student test.</p>
                </div>
                <span className="text-xs font-semibold text-emerald-600 block">Launch Test &rarr;</span>
              </div>
            </div>

            <div className="flex justify-start pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="ghost" onClick={() => setCurrentStep(5)}>Back to Preview</Button>
            </div>
          </div>
        )}
      </Card>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Questions" size="xl">
        <div className="p-6">
          <div className="flex gap-4 mb-4 flex-wrap">
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
                      {question.serial_id && (
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-900/50">
                          Q-{question.serial_id}
                        </span>
                      )}
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
