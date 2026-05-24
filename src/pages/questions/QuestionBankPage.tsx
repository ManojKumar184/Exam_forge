import React, { useEffect, useState } from 'react';
import { useDataStore } from '../../stores/dataStore';
import { useAuth } from '../../hooks/useAuth';
import {
  Card, Button, Badge, Input, Select, Modal, Textarea, Loading, EmptyState, Alert
} from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { Search, Filter, Eye, Check, X, Trash2, Edit, ChevronDown } from 'lucide-react';
import type { Question, Subject, Chapter, ExamType } from '../../types';

export function QuestionBankPage() {
  const { canApproveQuestions, isAdmin } = useAuth();
  const {
    subjects, chapters, examTypes, questions, isLoading,
    fetchSubjects, fetchChapters, fetchExamTypes, fetchQuestions,
    approveQuestion, rejectQuestion, deleteQuestion, updateQuestion
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

  useEffect(() => {
    fetchSubjects();
    fetchExamTypes();
    applyFilters();
  }, []);

  useEffect(() => {
    if (filters.subject_id) {
      fetchChapters(filters.subject_id);
    }
  }, [filters.subject_id]);

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
          </p>
        </div>
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
                    {question.question_text}
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
                  {canApproveQuestions && question.status === 'pending' && (
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
              <p className="text-slate-700 dark:text-slate-300">{selectedQuestion.question_text}</p>
            </div>
            {selectedQuestion.question_latex && (
              <div className="bg-slate-50 dark:bg-slate-700 p-4 rounded-lg">
                <code className="text-sm">{selectedQuestion.question_latex}</code>
              </div>
            )}
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
                      <span className="font-medium">{String.fromCharCode(65 + idx)}.</span> {opt.text || opt}
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
              onChange={(e) => setEditData(prev => ({ ...prev, class: parseInt(e.target.value) }))}
            />
            <Select
              label="Difficulty"
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' }
              ]}
              value={editData.difficulty || ''}
              onChange={(e) => setEditData(prev => ({ ...prev, difficulty: e.target.value as any }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Subject"
              options={subjects.map(s => ({ value: s.id, label: s.name }))}
              value={editData.subject_id || ''}
              onChange={(e) => setEditData(prev => ({ ...prev, subject_id: e.target.value }))}
            />
            <Input
              label="Marks"
              type="number"
              value={editData.marks?.toString() || ''}
              onChange={(e) => setEditData(prev => ({ ...prev, marks: parseInt(e.target.value) }))}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
