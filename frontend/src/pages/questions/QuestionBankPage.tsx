import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useDataStore } from '../../stores/dataStore';
import { useAuth } from '../../hooks/useAuth';
import { fetchSyllabusTree, type SyllabusNode } from '../../api/syllabus';
import { fetchQuestionBanksApi, assignQuestionsToBankApi, removeQuestionsFromBankApi, type QuestionBank } from '../../api/questionBanks';
import {
  Card, Button, Badge, Input, Select, Modal, Loading, EmptyState, Alert, PageHeader
} from '../../components/ui';
import { Link } from 'react-router-dom';
import { Search, Eye, Check, X, Trash2, Edit, Plus } from 'lucide-react';
import type { Question } from '../../types';
import { QuestionContentPreview, RichContent } from '../../components/content/RichContent';
import { QuestionPreviewModal } from '../../components/questions/QuestionPreviewModal';
import { QuestionList } from '../../components/questions/QuestionList';

function getConfidenceVariant(confidence: number): 'success' | 'warning' | 'error' | 'default' {
  if (confidence >= 75) return 'success';
  if (confidence >= 50) return 'warning';
  if (confidence > 0) return 'error';
  return 'default';
}

function getQuestionTypeVariant(type: string): 'success' | 'warning' | 'info' | 'default' {
  const normalized = type.toLowerCase();
  if (normalized === 'mcq' || normalized === 'mcq_single' || normalized === 'mcq_multiple' || normalized === 'mcq_multi') return 'info';
  if (normalized === 'numerical' || normalized === 'numerical_integer' || normalized === 'integer') return 'warning';
  if (normalized === 'assertion_reason' || normalized === 'match_following') return 'success';
  if (normalized === 'descriptive') return 'default';
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
    ['mcq_single', 'mcq_multiple', 'numerical_integer', 'integer_type', 'match_following', 'comprehension'].includes(t)
  );
  return sub?.replace(/_/g, ' ') || null;
}

export function QuestionBankPage() {
  const { canApproveQuestions, isAdmin, isFaculty } = useAuth();
  const {
    subjects, examTypes, questions, isLoading,
    fetchSubjects, fetchExamTypes, fetchQuestions,
    approveQuestion, deleteQuestion,
    bulkApproveQuestions, bulkDeleteQuestions, bulkUpdateQuestionsMetadata,
  } = useDataStore();

  const [syllabusTree, setSyllabusTree] = useState<SyllabusNode[]>([]);
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const [selectedBulkBankId, setSelectedBulkBankId] = useState('');
  const [filters, setFilters] = useState({
    subject_id: '',
    chapter_id: '',
    exam_type_id: '',
    class: '',
    difficulty: '',
    question_type: '',
    status: '',
    search: '',
    syllabus_exam_pattern_id: '',
    syllabus_class_id: '',
    syllabus_subject_id: '',
    syllabus_chapter_id: '',
    syllabus_topic_id: '',

    bank_id: '',
  });
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkMetaModal, setShowBulkMetaModal] = useState(false);
  const [bulkMeta, setBulkMeta] = useState<Partial<Question>>({});

  useEffect(() => {
    fetchSubjects();
    fetchExamTypes();
    fetchSyllabusTree().then(setSyllabusTree).catch((err) => console.error(err));
    fetchQuestionBanksApi().then(setBanksData => setQuestionBanks(setBanksData)).catch((err) => console.error(err));
    applyFilters();
  }, []);

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

  const allSelected = questions.length > 0 && selectedIds.length === questions.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(questions.map((q) => q.id));
  };

  return (
    <div className="space-y-3 pb-20 -mt-1">
      <PageHeader
        title="Question Bank"
        subtitle={`${questions.length} questions${selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ''}`}
        actions={(isAdmin || isFaculty) && (
          <Link to="/questions/new">
            <Button size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              Create question
            </Button>
          </Link>
        )}
      />

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
          <div className="w-full sm:w-36 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Question Bank"
              options={[
                { value: '', label: 'All Question Banks' },
                ...questionBanks.map((qb) => ({ value: qb._id, label: qb.name })),
              ]}
              value={filters.bank_id}
              onChange={(e) => handleFilterChange('bank_id', e.target.value)}
            />
          </div>
          <Button onClick={applyFilters} className="h-8 shrink-0 py-1 text-xs" size="sm">Apply</Button>
        </div>

        {/* Syllabus Tree Filters */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 mt-3">
          <span className="text-xs font-semibold text-slate-500 mr-2">Syllabus:</span>
          <div className="w-full sm:w-36 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Exam Pattern"
              options={[
                { value: '', label: 'All Patterns' },
                ...syllabusTree.map(n => ({ value: n._id, label: n.name }))
              ]}
              value={filters.syllabus_exam_pattern_id}
              onChange={(e) => {
                setFilters(prev => ({
                  ...prev,
                  syllabus_exam_pattern_id: e.target.value,
                  syllabus_class_id: '',
                  syllabus_subject_id: '',
                  syllabus_chapter_id: '',
                  syllabus_topic_id: '',
                }));
              }}
            />
          </div>
          <div className="w-full sm:w-28 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Syllabus Class"
              options={[
                { value: '', label: 'All Classes' },
                ...(syllabusTree.find(n => n._id === filters.syllabus_exam_pattern_id)?.children || []).map(n => ({ value: n._id, label: n.name }))
              ]}
              value={filters.syllabus_class_id}
              disabled={!filters.syllabus_exam_pattern_id}
              onChange={(e) => {
                setFilters(prev => ({
                  ...prev,
                  syllabus_class_id: e.target.value,
                  syllabus_subject_id: '',
                  syllabus_chapter_id: '',
                  syllabus_topic_id: '',
                }));
              }}
            />
          </div>
          <div className="w-full sm:w-32 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Syllabus Subject"
              options={[
                { value: '', label: 'All Subjects' },
                ...((syllabusTree.find(n => n._id === filters.syllabus_exam_pattern_id)?.children || [])
                  .find(n => n._id === filters.syllabus_class_id)?.children || []).map(n => ({ value: n._id, label: n.name }))
              ]}
              value={filters.syllabus_subject_id}
              disabled={!filters.syllabus_class_id}
              onChange={(e) => {
                setFilters(prev => ({
                  ...prev,
                  syllabus_subject_id: e.target.value,
                  syllabus_chapter_id: '',
                  syllabus_topic_id: '',
                }));
              }}
            />
          </div>
          <div className="w-full sm:w-36 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Syllabus Chapter"
              options={[
                { value: '', label: 'All Chapters' },
                ...(((syllabusTree.find(n => n._id === filters.syllabus_exam_pattern_id)?.children || [])
                  .find(n => n._id === filters.syllabus_class_id)?.children || [])
                  .find(n => n._id === filters.syllabus_subject_id)?.children || []).map(n => ({ value: n._id, label: n.name }))
              ]}
              value={filters.syllabus_chapter_id}
              disabled={!filters.syllabus_subject_id}
              onChange={(e) => {
                setFilters(prev => ({
                  ...prev,
                  syllabus_chapter_id: e.target.value,
                  syllabus_topic_id: '',
                }));
              }}
            />
          </div>
          <div className="w-full sm:w-36 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Syllabus Topic"
              options={[
                { value: '', label: 'All Topics' },
                ...((((syllabusTree.find(n => n._id === filters.syllabus_exam_pattern_id)?.children || [])
                  .find(n => n._id === filters.syllabus_class_id)?.children || [])
                  .find(n => n._id === filters.syllabus_subject_id)?.children || [])
                  .find(n => n._id === filters.syllabus_chapter_id)?.children || []).map(n => ({ value: n._id, label: n.name }))
              ]}
              value={filters.syllabus_topic_id}
              disabled={!filters.syllabus_chapter_id}
              onChange={(e) => {
                setFilters(prev => ({
                  ...prev,
                  syllabus_topic_id: e.target.value,
                }));
              }}
            />
          </div>
          <div className="w-full sm:w-36 shrink-0">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Topic"
              options={[
                { value: '', label: 'All Topics' },
                ...(((((syllabusTree.find(n => n._id === filters.syllabus_exam_pattern_id)?.children || [])
                  .find(n => n._id === filters.syllabus_class_id)?.children || [])
                  .find(n => n._id === filters.syllabus_subject_id)?.children || [])
                  .find(n => n._id === filters.syllabus_chapter_id)?.children || [])
                  .find(n => n._id === filters.syllabus_topic_id)?.children || []).map(n => ({ value: n._id, label: n.name }))
              ]}
              value={filters.syllabus_subtopic_id}
              disabled={!filters.syllabus_topic_id}
              onChange={(e) => {
                setFilters(prev => ({
                  ...prev,
                  syllabus_subtopic_id: e.target.value,
                }));
              }}
            />
          </div>
        </div>
      </Card>

      {/* Questions List */}
      <QuestionList
        questions={questions}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        isLoading={isLoading}
        allSelected={allSelected}
        onToggleSelectAll={toggleSelectAll}
        showSelection={!!isAdmin}
        renderCard={(question: Question, isSelected, onToggle) => {
          const sectionLabel = getSectionLabel(question);
          const subtype = getSubtypeLabel(question);
          const warnings = question.extraction_warnings || [];
          return (
            <Card key={question.id} className="group p-4 sm:p-5 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-800/50 transition-all duration-200 ease-in-out overflow-hidden bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-xl relative">
              {/* Top accent bar for status */}
              <div className={`absolute top-0 left-0 right-0 h-0.5 rounded-t-xl ${question.status === 'approved' ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : question.status === 'rejected' ? 'bg-gradient-to-r from-red-400 to-red-500' : question.status === 'needs_review' ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-500'}`} />
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                {isAdmin && (
                  <input
                    type="checkbox"
                    className="mt-1.5 rounded border-slate-300 dark:border-slate-600 shrink-0 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    checked={isSelected}
                    onChange={onToggle}
                  />
                )}
                <div className="flex-1 min-w-0">
                  {/* Badge Row */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    {question.serial_id && (
                      <span className="inline-flex items-center text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md border border-blue-100 dark:border-blue-900/50 shadow-sm">
                        <span className="mr-1">#</span>{question.serial_id}
                      </span>
                    )}
                    <Badge variant={getStatusColor(question.status)} size="sm">
                      {question.status === 'needs_review' ? 'Review' : question.status}
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
                    <Badge size="sm">Class {question.class}</Badge>
                    {question.ai_confidence > 0 && (
                      <Badge variant={getConfidenceVariant(question.ai_confidence)} size="sm" className="font-mono">
                        AI {question.ai_confidence}%
                      </Badge>
                    )}
                    {warnings.length > 0 && (
                      <span
                        className="inline-flex items-center text-xs text-amber-600 dark:text-amber-400 cursor-help underline decoration-dotted gap-1 bg-amber-50/50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded"
                        title={warnings.join(' · ')}
                      >
                        <span>⚠</span> {warnings.length}
                      </span>
                    )}
                  </div>

                  {/* Question Content */}
                  <div className="text-slate-900 dark:text-white mb-3 max-h-32 overflow-hidden relative">
                    <QuestionContentPreview question={question} compact />
                    <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white dark:from-slate-800/90 to-transparent pointer-events-none" />
                  </div>

                  {/* Options Grid */}
                  {['mcq', 'mcq_single', 'mcq_multiple', 'MCQ_SINGLE', 'MCQ_MULTIPLE'].includes(question.question_type) && question.options && question.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-3">
                      {(question.options as any[]).slice(0, 4).map((opt, idx) => (
                        <div
                          key={idx}
                          className={`text-xs sm:text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                            question.correct_option === idx
                              ? 'bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40 font-medium'
                              : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                          }`}
                          title={typeof opt === 'string' ? opt : opt.text}
                        >
                          <span className="font-semibold mr-1">{String.fromCharCode(65 + idx)}.</span> {typeof opt === 'string' ? opt : opt.text}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Subject/Chapter Info + Metadata */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                    {question.subject && (
                      <span className="inline-flex items-center text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded">
                        {question.subject.name}
                      </span>
                    )}
                    {question.chapter && (
                      <span className="inline-flex items-center text-xs text-slate-500 dark:text-slate-400">
                        <span className="mx-1 text-slate-300">·</span> {question.chapter.name}
                      </span>
                    )}
                    {question.year && (
                      <span className="inline-flex items-center text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded">
                        📅 {question.year}
                      </span>
                    )}
                    {question.marks != null && (
                      <span className="inline-flex items-center text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded">
                        {question.marks} marks
                      </span>
                    )}
                    {question.exam_type && (
                      <span className="inline-flex items-center text-xs text-slate-500 dark:text-slate-400">
                        <span className="mx-1 text-slate-300">·</span> {question.exam_type.name}
                      </span>
                    )}
                    {/* Question text word count */}
                    <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                      {((question.question_text || '').length).toLocaleString()} chars
                    </span>
                  </div>
                </div>

                {/* Action Buttons - right side */}
                <div className="flex flex-row sm:flex-col flex-wrap gap-1">
                  <button
                    onClick={() => setSelectedQuestion(question)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:shadow-sm transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" /> View
                  </button>
                  {canApproveQuestions && (question.status === 'pending' || question.status === 'needs_review') && (
                    <>
                      <button
                        onClick={() => handleApprove(question.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:shadow-sm transition-all"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => {
                          setSelectedQuestion(question);
                          setShowRejectModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 hover:shadow-sm transition-all"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </>
                  )}
                  {isAdmin && (
                    <>
                      <Link to={`/questions/${question.id}/edit`}>
                        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/40 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:shadow-sm transition-all">
                          <Edit className="w-3.5 h-3.5" /> Edit
                        </button>
                      </Link>
                      <button
                        onClick={() => handleDelete(question.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 hover:shadow-sm transition-all"
                        title="Delete question"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        }}
        renderBulkActions={(isAdmin && selectedIds.length > 0) ? (
          <>
            <div className="flex items-center gap-1.5 shrink-0 bg-slate-50 dark:bg-slate-700/50 p-1 rounded-lg border border-slate-200 dark:border-slate-600">
              <select
                value={selectedBulkBankId}
                onChange={(e) => setSelectedBulkBankId(e.target.value)}
                className="h-7 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-350 dark:border-slate-650 rounded px-2"
              >
                <option value="">System Global Bank</option>
                {questionBanks.map((qb) => (
                  <option key={qb._id} value={qb._id}>
                    {qb.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2.5 py-0.5"
                onClick={async () => {
                  try {
                    let targetBankId = selectedBulkBankId;
                    if (!targetBankId) {
                      const sysBank = questionBanks.find(qb => qb.type === 'system');
                      if (sysBank) targetBankId = sysBank._id;
                    }
                    if (targetBankId) {
                      await assignQuestionsToBankApi(targetBankId, selectedIds);
                      toast.success('Assigned selected questions to bank');
                    }
                    setSelectedIds([]);
                    applyFilters();
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to assign questions');
                  }
                }}
              >
                Assign to Bank
              </Button>
            </div>

            {filters.bank_id && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                onClick={async () => {
                  try {
                    await removeQuestionsFromBankApi(filters.bank_id, selectedIds);
                    toast.success('Removed selected questions from bank');
                    setSelectedIds([]);
                    applyFilters();
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to remove questions');
                  }
                }}
              >
                Remove from Bank
              </Button>
            )}

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
          </>
        ) : null}
      />

      {/* View Question Modal — replaces old inline modal */}
      {selectedQuestion && !showRejectModal && (
        <QuestionPreviewModal
          question={selectedQuestion}
          onClose={() => setSelectedQuestion(null)}
          title="Question Details"
          showExtraFields
          badges={
            <>
              {getSubtypeLabel(selectedQuestion) && (
                <Badge variant="info" size="sm">{getSubtypeLabel(selectedQuestion)}</Badge>
              )}
              {getSectionLabel(selectedQuestion) && (
                <Badge variant="default" size="sm">{getSectionLabel(selectedQuestion)}</Badge>
              )}
              {selectedQuestion.ai_confidence > 0 && (
                <Badge variant={getConfidenceVariant(selectedQuestion.ai_confidence)} size="sm">
                  AI {selectedQuestion.ai_confidence}%
                </Badge>
              )}
            </>
          }
        >
          {/* Extra content specific to Question Bank: explanation, warnings, OCR review */}
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
        </QuestionPreviewModal>
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
