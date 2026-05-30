import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useDataStore } from '../../stores/dataStore';
import { useAuth } from '../../hooks/useAuth';
import {
  Card, Button, Badge, Input, Select, Modal, Textarea, Loading, EmptyState, Alert
} from '../../components/ui';
import { Link } from 'react-router-dom';
import { Search, Eye, Check, X, Trash2, Edit, Plus } from 'lucide-react';
import type { Question } from '../../types';
import { QuestionContentPreview, RichContent } from '../../components/content/RichContent';

function getConfidenceVariant(confidence: number): 'success' | 'warning' | 'error' | 'default' {
  if (confidence >= 75) return 'success';
  if (confidence >= 50) return 'warning';
  if (confidence > 0) return 'error';
  return 'default';
}

function getQuestionTypeVariant(type: string): 'success' | 'warning' | 'info' | 'default' {
  if (type === 'mcq') return 'info';
  if (type === 'numerical') return 'warning';
  return 'default';
}

function getSectionLabel(question: Question): string | null {
  const tag = question.tags?.find((t) => t.startsWith('section:'));
  if (tag) return tag.replace(/^section:/, '');
  const meta = question.rendering_metadata as { section?: string } | undefined;
  return meta?.section || null;
}

function getSubtypeLabel(question: Question): string | null {
  const sub = question.tags?.find((t) =>
    ['mcq_single', 'mcq_multiple', 'integer_type', 'match_following', 'comprehension'].includes(t)
  );
  return sub?.replace(/_/g, ' ') || null;
}

export function QuestionBankPage() {
  const { canApproveQuestions, isAdmin, isFaculty } = useAuth();
  const {
    subjects, chapters, examTypes, questions, isLoading,
    fetchSubjects, fetchChapters, fetchExamTypes, fetchQuestions,
    approveQuestion, deleteQuestion, updateQuestion,
    bulkApproveQuestions, bulkDeleteQuestions, bulkUpdateQuestionsMetadata,
  } = useDataStore();

  const [filters, setFilters] = useState({
    subject_id: '',
    chapter_id: '',
    exam_type_id: '',
    class: '',
    difficulty: '',
    question_type: '',
    status: '',
    search: ''
  });
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState<Partial<Question>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkMetaModal, setShowBulkMetaModal] = useState(false);
  const [bulkMeta, setBulkMeta] = useState<Partial<Question>>({});
  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    fetchSubjects();
    fetchExamTypes();
    applyFilters();
  }, []);

  useEffect(() => {
    if (editData.subject_id || filters.subject_id) {
      fetchChapters((editData.subject_id || filters.subject_id) as string);
    }
  }, [filters.subject_id, editData.subject_id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      applyFilters();
    }, filters.search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const applyFilters = () => {
    const cleanFilters: Record<string, any> = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value) cleanFilters[key] = value;
    });
    fetchQuestions(cleanFilters);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleApprove = async (questionId: string) => {
    await approveQuestion(questionId);
    setSelectedQuestion(null);
    applyFilters();
  };

  const handleReject = async () => {
    if (selectedQuestion) {
      await deleteQuestion(selectedQuestion.id);
      setShowRejectModal(false);
      setSelectedQuestion(null);
      applyFilters();
    }
  };

  const handleDelete = async (questionId: string) => {
    if (confirm('Are you sure you want to delete this question?')) {
      await deleteQuestion(questionId);
      applyFilters();
    }
  };

  const handleEdit = async () => {
    if (selectedQuestion) {
      const res = await updateQuestion(selectedQuestion.id, editData);
      if (res?.error) {
        toast.error(res.error.message || 'Update failed');
      } else {
        toast.success('Question updated successfully');
        setShowEditModal(false);
        setSelectedQuestion(null);
        applyFilters();
      }
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'success';
      case 'medium': return 'warning';
      case 'hard': return 'error';
      default: return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'success';
      case 'pending': return 'warning';
      case 'needs_review': return 'info';
      case 'rejected': return 'error';
      default: return 'default';
    }
  };

  const filteredChapters = chapters.filter(c => c.subject_id === filters.subject_id);
  const allSelected = questions.length > 0 && selectedIds.length === questions.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(questions.map((q) => q.id));
  };

  return (
    <div className="space-y-3 pb-20 -mt-1">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Question Bank</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs">
            {questions.length} questions
            {selectedIds.length > 0 && ` · ${selectedIds.length} selected`}
          </p>
        </div>
        {(isAdmin || isFaculty) && (
          <Link to="/questions/new">
            <Button size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              Create question
            </Button>
          </Link>
        )}
      </div>

      <Card className="p-1.5 sm:p-2 sticky top-0 z-20 bg-white/95 dark:bg-slate-800/95 backdrop-blur border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="w-full sm:w-48 flex-1 sm:flex-none">
            <Input
              placeholder="Search questions..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              leftIcon={<Search className="w-3.5 h-3.5" />}
              className="h-8 text-xs py-1"
            />
          </div>
          <div className="w-full sm:w-32 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Subject"
              options={[{ value: '', label: 'All Subjects' }, ...subjects.map(s => ({ value: s.id, label: s.name }))]}
              value={filters.subject_id}
              onChange={(e) => handleFilterChange('subject_id', e.target.value)}
            />
          </div>
          <div className="w-full sm:w-36 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Chapter"
              options={[{ value: '', label: 'All Chapters' }, ...filteredChapters.map(c => ({ value: c.id, label: c.name }))]}
              value={filters.chapter_id}
              onChange={(e) => handleFilterChange('chapter_id', e.target.value)}
            />
          </div>
          <div className="w-full sm:w-24 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Class"
              options={[
                { value: '', label: 'All Classes' },
                ...[6, 7, 8, 9, 10, 11, 12].map(c => ({ value: c.toString(), label: `Class ${c}` }))
              ]}
              value={filters.class}
              onChange={(e) => handleFilterChange('class', e.target.value)}
            />
          </div>
          <div className="w-full sm:w-28 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Difficulty"
              options={[
                { value: '', label: 'All Difficulties' },
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' }
              ]}
              value={filters.difficulty}
              onChange={(e) => handleFilterChange('difficulty', e.target.value)}
            />
          </div>
          <div className="w-full sm:w-24 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Type"
              options={[
                { value: '', label: 'All Types' },
                { value: 'mcq', label: 'MCQ' },
                { value: 'descriptive', label: 'Descriptive' },
                { value: 'numerical', label: 'Numerical' }
              ]}
              value={filters.question_type}
              onChange={(e) => handleFilterChange('question_type', e.target.value)}
            />
          </div>
          <div className="w-full sm:w-28 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Status"
              options={[
                { value: '', label: 'All Status' },
                { value: 'pending', label: 'Pending' },
                { value: 'needs_review', label: 'Needs Review' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' }
              ]}
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            />
          </div>
          <Button onClick={applyFilters} className="h-8 shrink-0 py-1 text-xs" size="sm">Apply</Button>
        </div>
      </Card>

      {/* Questions List */}
      {isLoading ? (
        <Loading text="Loading questions..." />
      ) : questions.length === 0 ? (
        <EmptyState
          title="No questions found"
          description="Try adjusting your filters or upload new questions"
        />
      ) : (
        <div className="space-y-3">
          {isAdmin && (
            <div className="flex items-center gap-3 px-1 py-2 border-b border-slate-200 dark:border-slate-700">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
                Select all on this page
              </label>
            </div>
          )}
          {questions.map((question) => {
            const sectionLabel = getSectionLabel(question);
            const subtype = getSubtypeLabel(question);
            const warnings = question.extraction_warnings || [];
            return (
            <Card key={question.id} className="p-3 sm:p-4 hover:shadow-md transition-shadow overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                {isAdmin && (
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-slate-300 shrink-0"
                    checked={selectedIds.includes(question.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds((ids) => [...ids, question.id]);
                      else setSelectedIds((ids) => ids.filter((id) => id !== question.id));
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <Badge variant={getStatusColor(question.status)} size="sm">
                      {question.status}
                    </Badge>
                    <Badge variant={getQuestionTypeVariant(question.question_type)} size="sm">
                      {question.question_type.toUpperCase()}
                    </Badge>
                    {subtype && (
                      <Badge variant="info" size="sm">
                        {subtype}
                      </Badge>
                    )}
                    {sectionLabel && (
                      <Badge variant="default" size="sm">
                        {sectionLabel}
                      </Badge>
                    )}
                    <Badge variant={getDifficultyColor(question.difficulty)} size="sm">
                      {question.difficulty}
                    </Badge>
                    <Badge size="sm">C{question.class}</Badge>
                    {question.ai_confidence > 0 && (
                      <Badge variant={getConfidenceVariant(question.ai_confidence)} size="sm">
                        AI {question.ai_confidence}%
                      </Badge>
                    )}
                    {warnings.length > 0 && (
                      <span
                        className="text-xs text-amber-600 dark:text-amber-400 cursor-help underline decoration-dotted"
                        title={warnings.join(' · ')}
                      >
                        ⚠ {warnings.length} note{warnings.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-900 dark:text-white mb-2 max-h-24 overflow-hidden">
                    <QuestionContentPreview question={question} compact />
                  </div>
                  {question.question_type === 'mcq' && question.options && question.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">
                      {(question.options as any[]).slice(0, 4).map((opt, idx) => (
                        <div
                          key={idx}
                          className={`text-xs sm:text-sm px-2 py-1 rounded truncate ${
                            question.correct_option === idx
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                          title={typeof opt === 'string' ? opt : opt.text}
                        >
                          {String.fromCharCode(65 + idx)}. {typeof opt === 'string' ? opt : opt.text}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                    {question.subject && <span>{question.subject.name}</span>}
                    {question.chapter && <span>{question.chapter.name}</span>}
                  </div>
                </div>
                <div className="flex flex-row sm:flex-col flex-wrap gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedQuestion(question)}
                    leftIcon={<Eye className="w-4 h-4" />}
                  >
                    View
                  </Button>
                  {canApproveQuestions && (question.status === 'pending' || question.status === 'needs_review') && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleApprove(question.id)}
                        leftIcon={<Check className="w-4 h-4" />}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedQuestion(question);
                          setShowRejectModal(true);
                        }}
                        leftIcon={<X className="w-4 h-4" />}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <>
                      <Link to={`/questions/${question.id}/edit`}>
                        <Button variant="ghost" size="sm" leftIcon={<Edit className="w-4 h-4" />}>
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedQuestion(question);
                          setEditData(question);
                          setTagsInput((question.tags || []).join(', '));
                          setShowEditModal(true);
                        }}
                        leftIcon={<Edit className="w-4 h-4" />}
                        className="hidden lg:inline-flex"
                      >
                        Quick
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(question.id)}
                        leftIcon={<Trash2 className="w-4 h-4 text-red-500" />}
                        title="Delete question"
                      />
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
          })}
        </div>
      )}

      {isAdmin && selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-40 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.08)] safe-area-pb">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {selectedIds.length} selected
            </span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowBulkMetaModal(true)}>
                Edit metadata
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  const res = await bulkApproveQuestions(selectedIds);
                  if (res?.error) {
                    toast.error(res.error.message || 'Failed to approve questions');
                  } else {
                    toast.success('Approved selected questions successfully');
                    setSelectedIds([]);
                    applyFilters();
                  }
                }}
              >
                Approve all
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  if (confirm('Are you sure you want to reject and delete all selected questions?')) {
                    const res = await bulkDeleteQuestions(selectedIds);
                    if (res?.error) {
                      toast.error(res.error.message || 'Failed to delete questions');
                    } else {
                      toast.success('Deleted selected questions successfully');
                      setSelectedIds([]);
                      applyFilters();
                    }
                  }
                }}
              >
                Reject all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* View Question Modal */}
      {selectedQuestion && !showRejectModal && !showEditModal && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedQuestion(null)}
          title="Question Details"
          size="lg"
        >
          <div className="p-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={getStatusColor(selectedQuestion.status)}>{selectedQuestion.status}</Badge>
              <Badge variant={getQuestionTypeVariant(selectedQuestion.question_type)}>
                {selectedQuestion.question_type.toUpperCase()}
              </Badge>
              {getSubtypeLabel(selectedQuestion) && (
                <Badge variant="info">{getSubtypeLabel(selectedQuestion)}</Badge>
              )}
              {getSectionLabel(selectedQuestion) && (
                <Badge>{getSectionLabel(selectedQuestion)}</Badge>
              )}
              <Badge variant={getDifficultyColor(selectedQuestion.difficulty)}>{selectedQuestion.difficulty}</Badge>
              <Badge>Class {selectedQuestion.class}</Badge>
              {selectedQuestion.ai_confidence > 0 && (
                <Badge variant={getConfidenceVariant(selectedQuestion.ai_confidence)}>
                  AI {selectedQuestion.ai_confidence}%
                </Badge>
              )}
            </div>
            <div className="space-y-4">
              <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/30 shadow-sm">
                <QuestionContentPreview question={selectedQuestion} showOptions showCorrect />
              </div>
              {selectedQuestion.question_type === 'numerical' && selectedQuestion.numerical_answer != null && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-700 dark:text-slate-350 text-sm">Correct Answer:</span>
                  <Badge variant="success" size="md">{selectedQuestion.numerical_answer}</Badge>
                </div>
              )}
            </div>
            {selectedQuestion.explanation && (
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white mb-2">Explanation</h4>
                <RichContent text={selectedQuestion.explanation} compact />
              </div>
            )}
            {(selectedQuestion.extraction_warnings?.length ?? 0) > 0 && (
              <Alert variant="warning" title="Classification notes">
                <ul className="list-disc pl-4 text-sm mt-1">
                  {selectedQuestion.extraction_warnings?.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </Alert>
            )}
            {(() => {
              const ocr = selectedQuestion.rendering_metadata?.ocr as
                | {
                    rawTextPreview?: string;
                    confidence?: number;
                    uncertainSpans?: unknown[];
                  }
                | undefined;
              return (
                ocr || selectedQuestion.ai_metadata?.ocrConfidence != null
              );
            })() && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-4 space-y-3">
                <h4 className="font-medium text-slate-900 dark:text-white">OCR review</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 mb-1 font-medium">Raw OCR preview</p>
                    <pre className="whitespace-pre-wrap text-xs p-3 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 max-h-48 overflow-auto">
                      {(selectedQuestion.rendering_metadata?.ocr as { rawTextPreview?: string })
                        ?.rawTextPreview || 'No raw preview stored'}
                    </pre>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1 font-medium">Parsed question (verify)</p>
                    <div className="p-3 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600">
                      <QuestionContentPreview question={selectedQuestion} compact />
                    </div>
                    {(selectedQuestion.rendering_metadata?.ocr as { confidence?: number })
                      ?.confidence != null && (
                      <p className="mt-2 text-slate-500">
                        OCR confidence:{' '}
                        {Math.round(
                          (selectedQuestion.rendering_metadata?.ocr as { confidence: number })
                            .confidence
                        )}
                        %
                      </p>
                    )}
                    {((selectedQuestion.rendering_metadata?.ocr as { uncertainSpans?: unknown[] })
                      ?.uncertainSpans?.length ?? 0) > 0 && (
                      <p className="mt-1 text-amber-700 dark:text-amber-400">
                        {
                          (selectedQuestion.rendering_metadata?.ocr as { uncertainSpans: unknown[] })
                            .uncertainSpans.length
                        }{' '}
                        uncertain
                        region(s) — edit before approval
                      </p>
                    )}
                  </div>
                </div>
                {selectedQuestion.ai_metadata?.providers && (
                  <p className="text-xs text-slate-500">
                    Classification: {(selectedQuestion.ai_metadata.providers as string[]).join(' → ')}
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-sm text-slate-500">Subject</p>
                <p className="font-medium text-slate-900 dark:text-white">{selectedQuestion.subject?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Chapter</p>
                <p className="font-medium text-slate-900 dark:text-white">{selectedQuestion.chapter?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Exam type</p>
                <p className="font-medium text-slate-900 dark:text-white">{selectedQuestion.exam_type?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Tags</p>
                <p className="font-medium text-slate-900 dark:text-white">
                  {selectedQuestion.tags?.length ? selectedQuestion.tags.join(', ') : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">AI Confidence</p>
                <p className="font-medium text-slate-900 dark:text-white">{selectedQuestion.ai_confidence}%</p>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Reject & Delete Question"
        size="md"
      >
        <div className="p-6 space-y-4">
          <Alert variant="error">
            Are you sure you want to reject this question? Rejecting will delete it permanently from the database.
          </Alert>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowRejectModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleReject}>
              Reject & Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Question"
        size="lg"
      >
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <Textarea
            label="Question Text"
            value={editData.question_text || ''}
            onChange={(e) => setEditData(prev => ({ ...prev, question_text: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Class"
              options={[6, 7, 8, 9, 10, 11, 12].map(c => ({ value: c.toString(), label: `Class ${c}` }))}
              value={editData.class?.toString() || ''}
              onChange={(e) => setEditData(prev => ({ ...prev, class: parseInt(e.target.value, 10) }))}
            />
            <Select
              label="Difficulty"
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' }
              ]}
              value={editData.difficulty || ''}
              onChange={(e) => setEditData(prev => ({ ...prev, difficulty: e.target.value as Question['difficulty'] }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Subject"
              options={subjects.map(s => ({ value: s.id, label: s.name }))}
              value={editData.subject_id || ''}
              onChange={(e) => setEditData(prev => ({ ...prev, subject_id: e.target.value, chapter_id: '' }))}
            />
            <Select
              label="Topic / Chapter"
              options={chapters
                .filter((c) => c.subject_id === editData.subject_id)
                .map((c) => ({ value: c.id, label: c.name }))}
              value={editData.chapter_id || ''}
              onChange={(e) => setEditData(prev => ({ ...prev, chapter_id: e.target.value }))}
              placeholder="Select chapter"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Exam type"
              options={examTypes.map((e) => ({ value: e.id, label: e.name }))}
              value={editData.exam_type_id || ''}
              onChange={(e) => setEditData(prev => ({ ...prev, exam_type_id: e.target.value }))}
            />
          </div>
          <Input
            label="Tags (comma-separated)"
            value={tagsInput}
            onChange={(e) => {
              setTagsInput(e.target.value);
              setEditData((prev) => ({
                ...prev,
                tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
              }));
            }}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showBulkMetaModal}
        onClose={() => setShowBulkMetaModal(false)}
        title={`Bulk metadata (${selectedIds.length} questions)`}
        size="lg"
      >
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-500">Only filled fields will be applied to all selected questions.</p>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Class"
              options={[{ value: '', label: '— leave —' }, ...[6, 7, 8, 9, 10, 11, 12].map((c) => ({ value: c.toString(), label: `Class ${c}` }))]}
              value={bulkMeta.class?.toString() || ''}
              onChange={(e) =>
                setBulkMeta((p) => ({
                  ...p,
                  class: e.target.value ? parseInt(e.target.value, 10) : undefined,
                }))
              }
            />
            <Select
              label="Difficulty"
              options={[
                { value: '', label: '— leave —' },
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
              value={bulkMeta.difficulty || ''}
              onChange={(e) =>
                setBulkMeta((p) => ({
                  ...p,
                  difficulty: (e.target.value || undefined) as Question['difficulty'] | undefined,
                }))
              }
            />
            <Select
              label="Subject"
              options={[{ value: '', label: '— leave —' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
              value={bulkMeta.subject_id || ''}
              onChange={(e) => setBulkMeta((p) => ({ ...p, subject_id: e.target.value || undefined }))}
            />
            <Select
              label="Exam type"
              options={[{ value: '', label: '— leave —' }, ...examTypes.map((e) => ({ value: e.id, label: e.name }))]}
              value={bulkMeta.exam_type_id || ''}
              onChange={(e) => setBulkMeta((p) => ({ ...p, exam_type_id: e.target.value || undefined }))}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowBulkMetaModal(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                const updates: Partial<Question> = {};
                if (bulkMeta.class) updates.class = bulkMeta.class;
                if (bulkMeta.difficulty) updates.difficulty = bulkMeta.difficulty;
                if (bulkMeta.subject_id) updates.subject_id = bulkMeta.subject_id;
                if (bulkMeta.chapter_id) updates.chapter_id = bulkMeta.chapter_id;
                if (bulkMeta.exam_type_id) updates.exam_type_id = bulkMeta.exam_type_id;
                if (bulkMeta.tags?.length) updates.tags = bulkMeta.tags;
                const res = await bulkUpdateQuestionsMetadata(selectedIds, updates);
                if (res?.error) {
                  toast.error(res.error.message || 'Failed to update metadata');
                } else {
                  toast.success('Updated metadata successfully');
                  setShowBulkMetaModal(false);
                  setBulkMeta({});
                  setSelectedIds([]);
                  applyFilters();
                }
              }}
            >
              Apply to selected
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
