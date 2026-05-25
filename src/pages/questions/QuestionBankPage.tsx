import React, { useEffect, useState } from 'react';
import { useDataStore } from '../../stores/dataStore';
import { useAuth } from '../../hooks/useAuth';
import {
  Card, Button, Badge, Input, Select, Modal, Textarea, Loading, EmptyState, Alert
} from '../../components/ui';
import { Search, Eye, Check, X, Trash2, Edit } from 'lucide-react';
import type { Question, Subject, Chapter, ExamType } from '../../types';
import { QuestionContentPreview } from '../../components/content/RichContent';

export function QuestionBankPage() {
  const { canApproveQuestions, isAdmin } = useAuth();
  const {
    subjects, chapters, examTypes, questions, isLoading,
    fetchSubjects, fetchChapters, fetchExamTypes, fetchQuestions,
    approveQuestion, rejectQuestion, deleteQuestion, updateQuestion,
    bulkApproveQuestions, bulkRejectQuestions, bulkDeleteQuestions, bulkUpdateQuestionsMetadata,
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
  const [rejectReason, setRejectReason] = useState('');
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
    if (selectedQuestion && rejectReason) {
      await rejectQuestion(selectedQuestion.id, rejectReason);
      setShowRejectModal(false);
      setRejectReason('');
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
      await updateQuestion(selectedQuestion.id, editData);
      setShowEditModal(false);
      setSelectedQuestion(null);
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

  const filteredChapters = chapters.filter(c => c.subject_id === filters.subject_id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Question Bank</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {questions.length} questions found
            {selectedIds.length > 0 && ` · ${selectedIds.length} selected`}
          </p>
        </div>
        {isAdmin && selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowBulkMetaModal(true)}>
              Bulk edit metadata
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await bulkApproveQuestions(selectedIds);
                setSelectedIds([]);
                applyFilters();
              }}
            >
              Approve ({selectedIds.length})
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                const notes = prompt('Rejection reason for all selected?') || 'Bulk rejected';
                await bulkRejectQuestions(selectedIds, notes);
                setSelectedIds([]);
                applyFilters();
              }}
            >
              Reject
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <Input
            placeholder="Search questions..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
          <Select
            placeholder="Subject"
            options={[{ value: '', label: 'All Subjects' }, ...subjects.map(s => ({ value: s.id, label: s.name }))]}
            value={filters.subject_id}
            onChange={(e) => handleFilterChange('subject_id', e.target.value)}
          />
          <Select
            placeholder="Chapter"
            options={[{ value: '', label: 'All Chapters' }, ...filteredChapters.map(c => ({ value: c.id, label: c.name }))]}
            value={filters.chapter_id}
            onChange={(e) => handleFilterChange('chapter_id', e.target.value)}
          />
          <Select
            placeholder="Class"
            options={[
              { value: '', label: 'All Classes' },
              ...[6, 7, 8, 9, 10, 11, 12].map(c => ({ value: c.toString(), label: `Class ${c}` }))
            ]}
            value={filters.class}
            onChange={(e) => handleFilterChange('class', e.target.value)}
          />
          <Select
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
          <Select
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
          <Select
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
          <Button onClick={applyFilters} className="h-10">Apply Filters</Button>
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
        <div className="space-y-4">
          {questions.map((question) => (
            <Card key={question.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                {isAdmin && (
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-slate-300"
                    checked={selectedIds.includes(question.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds((ids) => [...ids, question.id]);
                      else setSelectedIds((ids) => ids.filter((id) => id !== question.id));
                    }}
                  />
                )}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant={getStatusColor(question.status)} size="sm">
                      {question.status}
                    </Badge>
                    <Badge variant={getDifficultyColor(question.difficulty)} size="sm">
                      {question.difficulty}
                    </Badge>
                    <Badge size="sm">Class {question.class}</Badge>
                    <Badge size="sm">{question.question_type.toUpperCase()}</Badge>
                    <Badge size="sm">{question.marks} marks</Badge>
                  </div>
                  <p className="text-slate-900 dark:text-white mb-2 line-clamp-2">
                    <span className="line-clamp-2">{question.question_text}</span>
                    {(question.has_equation || question.has_diagram) && (
                      <span className="text-xs text-blue-500 mt-1 block">
                        {question.has_equation ? 'Math ' : ''}
                        {question.has_diagram ? 'Figures' : ''}
                      </span>
                    )}
                  </p>
                  {question.question_type === 'mcq' && question.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      {(question.options as any[]).map((opt, idx) => (
                        <div
                          key={idx}
                          className={`text-sm px-3 py-1.5 rounded-lg ${
                            question.correct_option === idx
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {String.fromCharCode(65 + idx)}. {opt.text || opt}
                          {question.correct_option === idx && ' ✓'}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
                    {question.subject && <span>{question.subject.name}</span>}
                    {question.chapter && <span>| {question.chapter.name}</span>}
                    {question.ai_confidence > 0 && (
                      <span>| AI Confidence: {question.ai_confidence}%</span>
                    )}
                  </div>
                </div>
                <div className="flex lg:flex-col gap-2">
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
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(question.id)}
                        leftIcon={<Trash2 className="w-4 h-4 text-red-500" />}
                      />
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
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
              <Badge variant={getDifficultyColor(selectedQuestion.difficulty)}>{selectedQuestion.difficulty}</Badge>
              <Badge>Class {selectedQuestion.class}</Badge>
              <Badge>{selectedQuestion.question_type.toUpperCase()}</Badge>
            </div>
            <div>
              <h4 className="font-medium text-slate-900 dark:text-white mb-2">Question</h4>
              <QuestionContentPreview question={selectedQuestion} />
            </div>
            {selectedQuestion.question_type === 'mcq' && selectedQuestion.options && (
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white mb-2">Options</h4>
                <div className="space-y-2">
                  {(selectedQuestion.options as any[]).map((opt, idx) => (
                    <div
                      key={idx}
                      className={`px-4 py-2 rounded-lg ${
                        selectedQuestion.correct_option === idx
                          ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
                          : 'bg-slate-50 dark:bg-slate-700'
                      }`}
                    >
                      <QuestionContentPreview
                        question={{
                          ...selectedQuestion,
                          question_text: typeof opt === 'string' ? opt : opt.text || '',
                          question_latex: opt.latex,
                          question_images: opt.image ? [opt.image] : [],
                        }}
                        compact
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedQuestion.explanation && (
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white mb-2">Explanation</h4>
                <p className="text-slate-600 dark:text-slate-400">{selectedQuestion.explanation}</p>
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
            {(selectedQuestion.rendering_metadata?.ocr ||
              selectedQuestion.ai_metadata?.ocrConfidence != null) && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-4 space-y-3">
                <h4 className="font-medium text-slate-900 dark:text-white">OCR review</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 mb-1 font-medium">Raw OCR preview</p>
                    <pre className="whitespace-pre-wrap text-xs p-3 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 max-h-48 overflow-auto">
                      {selectedQuestion.rendering_metadata?.ocr?.rawTextPreview ||
                        'No raw preview stored'}
                    </pre>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1 font-medium">Parsed question (verify)</p>
                    <div className="p-3 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600">
                      <QuestionContentPreview question={selectedQuestion} compact />
                    </div>
                    {selectedQuestion.rendering_metadata?.ocr?.confidence != null && (
                      <p className="mt-2 text-slate-500">
                        OCR confidence:{' '}
                        {Math.round(selectedQuestion.rendering_metadata.ocr.confidence)}%
                      </p>
                    )}
                    {(selectedQuestion.rendering_metadata?.ocr?.uncertainSpans?.length ?? 0) >
                      0 && (
                      <p className="mt-1 text-amber-700 dark:text-amber-400">
                        {selectedQuestion.rendering_metadata.ocr.uncertainSpans.length} uncertain
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
                <p className="text-sm text-slate-500">Marks</p>
                <p className="font-medium text-slate-900 dark:text-white">{selectedQuestion.marks}</p>
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
        title="Reject Question"
        size="md"
      >
        <div className="p-6 space-y-4">
          <Alert variant="warning">
            Please provide a reason for rejecting this question.
          </Alert>
          <Textarea
            label="Rejection Reason"
            placeholder="Enter reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowRejectModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleReject} disabled={!rejectReason}>
              Reject Question
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
            <Input
              label="Marks"
              type="number"
              value={editData.marks?.toString() || ''}
              onChange={(e) => setEditData(prev => ({ ...prev, marks: parseInt(e.target.value, 10) }))}
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
                await bulkUpdateQuestionsMetadata(selectedIds, updates);
                setShowBulkMetaModal(false);
                setBulkMeta({});
                setSelectedIds([]);
                applyFilters();
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
