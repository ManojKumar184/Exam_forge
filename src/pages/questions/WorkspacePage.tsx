import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Search, Trash2, Edit, ArrowRight, Lock, Share2 } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useAuth } from '../../hooks/useAuth';
import { fetchQuestionBanksApi, assignQuestionsToBankApi, type QuestionBank } from '../../api/questionBanks';
import { Card, Button, Badge, Input, Select, Modal, Loading, EmptyState, Alert, PageHeader } from '../../components/ui';
import { QuestionContentPreview } from '../../components/content/RichContent';

export function WorkspacePage() {
  const { profile, isAdmin, isFaculty } = useAuth();
  const {
    subjects,
    questions,
    users,
    isLoading,
    fetchSubjects,
    fetchQuestions,
    fetchUsers,
    deleteQuestion,
    bulkDeleteQuestions,
  } = useDataStore();

  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishingBankId, setPublishingBankId] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  const [filters, setFilters] = useState({
    subject_id: '',
    class: '',
    difficulty: '',
    question_type: '',
    search: '',
  });

  // Load catalogs and workspaces list
  useEffect(() => {
    fetchSubjects();
    fetchQuestionBanksApi().then(setQuestionBanks).catch(err => console.error(err));

    if (isAdmin) {
      fetchUsers({ role: 'faculty' });
    }
  }, []);

  // Fetch workspace questions whenever filters or selected owner changes
  const loadWorkspaceQuestions = () => {
    const queryParams: Record<string, any> = {
      scope: 'workspace',
      status: 'pending,needs_review,approved,rejected', // Workspace allows all statuses
      subject_id: filters.subject_id || undefined,
      class: filters.class || undefined,
      difficulty: filters.difficulty || undefined,
      question_type: filters.question_type || undefined,
      search: filters.search || undefined,
    };

    if (isAdmin && selectedOwnerId) {
      queryParams.owner_id = selectedOwnerId;
    }

    fetchQuestions(queryParams);
  };

  useEffect(() => {
    loadWorkspaceQuestions();
  }, [selectedOwnerId, filters.subject_id, filters.class, filters.difficulty, filters.question_type]);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      loadWorkspaceQuestions();
    }, filters.search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === questions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(questions.map(q => q.id));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this question from your workspace?')) return;
    const { error } = await deleteQuestion(id);
    if (error) {
      toast.error(typeof error === 'string' ? error : 'Failed to delete question');
    } else {
      toast.success('Question deleted from workspace');
      loadWorkspaceQuestions();
      setSelectedIds(prev => prev.filter(x => x !== id));
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} questions from your workspace?`)) return;

    const { error } = await bulkDeleteQuestions(selectedIds);
    if (error) {
      toast.error(typeof error === 'string' ? error : 'Failed to delete questions');
    } else {
      toast.success('Selected questions deleted');
      loadWorkspaceQuestions();
      setSelectedIds([]);
    }
  };

  const handlePublish = async () => {
    if (!publishingBankId || !selectedIds.length) {
      toast.error('Please select a question bank');
      return;
    }

    setIsPublishing(true);
    try {
      await assignQuestionsToBankApi(publishingBankId, selectedIds);
      toast.success(`Published ${selectedIds.length} question(s) successfully`);
      setShowPublishModal(false);
      setSelectedIds([]);
      loadWorkspaceQuestions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to publish questions');
    } finally {
      setIsPublishing(false);
    }
  };

  // Filter allowed banks to publish to based on role/ownership
  const allowedBanks = questionBanks.filter(bank => {
    if (isAdmin) return true;
    const creatorId = typeof bank.createdBy === 'object' && bank.createdBy ? (bank.createdBy._id || bank.createdBy.id) : bank.createdBy;
    // Faculty can only publish to their own faculty or custom banks
    return (bank.type === 'faculty' || bank.type === 'custom') && String(creatorId) === String(profile?.id);
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title="Faculty Workspace"
        subtitle="Review, edit, and categorize your private questions. Only you can view this space until questions are published to a bank."
      />

      {/* Top Workspace Filters & Owner Selector */}
      <Card className="p-4 bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search questions..."
              className="pl-9"
              value={filters.search}
              onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
            />
          </div>

          <Select
            options={[
              { value: '', label: 'All Subjects' },
              ...subjects.map(s => ({ value: s.id, label: s.name })),
            ]}
            value={filters.subject_id}
            onChange={e => setFilters(prev => ({ ...prev, subject_id: e.target.value }))}
          />

          <Select
            options={[
              { value: '', label: 'All Classes' },
              ...[6, 7, 8, 9, 10, 11, 12].map(c => ({ value: String(c), label: `Class ${c}` })),
            ]}
            value={filters.class}
            onChange={e => setFilters(prev => ({ ...prev, class: e.target.value }))}
          />

          {isAdmin && (
            <Select
              label="Select Workspace"
              options={[
                { value: '', label: 'All Workspaces (Admin View)' },
                ...users
                  .filter(u => u.role === 'faculty')
                  .map(u => ({ value: u.id, label: `${u.full_name}'s Workspace` })),
              ]}
              value={selectedOwnerId}
              onChange={e => setSelectedOwnerId(e.target.value)}
            />
          )}
        </div>
      </Card>

      {/* Bulk action toolbar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl shadow-sm animate-fadeIn">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-primary-800 dark:text-primary-300">
              {selectedIds.length} question(s) selected
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={handleBulkDelete}
            >
              Delete Selected
            </Button>
            <Button
              size="sm"
              leftIcon={<Share2 className="w-4 h-4" />}
              onClick={() => {
                setPublishingBankId(allowedBanks[0]?._id || '');
                setShowPublishModal(true);
              }}
            >
              Publish Selected
            </Button>
          </div>
        </div>
      )}

      {/* Questions list */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loading text="Loading workspace questions..." />
        </div>
      ) : questions.length === 0 ? (
        <Card className="p-12 text-center bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <EmptyState
            title="Your Workspace is empty"
            description="All questions you upload, import, or save as drafts will appear here first. They remain private to you until published."
            action={
              <Link to="/upload">
                <Button leftIcon={<ArrowRight className="w-4 h-4" />}>Upload Documents</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                checked={selectedIds.length === questions.length}
                onChange={toggleSelectAll}
              />
              <span className="text-sm text-slate-500 font-medium">Select All Questions</span>
            </div>
            <span className="text-sm text-slate-500 font-medium">
              Showing {questions.length} question(s)
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {questions.map(q => {
              const isSelected = selectedIds.includes(q.id);
              const ownerName = isAdmin ? users.find(u => u.id === q.owner_id)?.full_name || 'Faculty' : null;

              return (
                <Card
                  key={q.id}
                  className={`p-5 transition-all relative border flex gap-4 ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50/20 dark:bg-primary-900/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                  }`}
                >
                  <div className="flex-shrink-0 pt-1">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                      checked={isSelected}
                      onChange={() => toggleSelect(q.id)}
                    />
                  </div>

                  <div className="flex-1 space-y-3 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">{q.subject?.name || 'No Subject'}</Badge>
                      <Badge variant="info">Class {q.class}</Badge>
                      {q.difficulty && (
                        <Badge
                          variant={
                            q.difficulty === 'hard'
                              ? 'error'
                              : q.difficulty === 'medium'
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {q.difficulty}
                        </Badge>
                      )}
                      {ownerName && (
                        <Badge variant="default" className="bg-slate-100 text-slate-800">
                          Workspace: {ownerName}
                        </Badge>
                      )}
                      <Badge variant="warning" className="flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Private Draft
                      </Badge>
                      {q.status !== 'approved' && (
                        <Badge
                          variant={
                            q.status === 'needs_review'
                              ? 'error'
                              : q.status === 'rejected'
                              ? 'error'
                              : 'warning'
                          }
                        >
                          Status: {q.status}
                        </Badge>
                      )}
                    </div>

                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <QuestionContentPreview question={q} />
                    </div>

                    {q.extraction_warnings && q.extraction_warnings.length > 0 && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-100 dark:border-amber-900/30">
                        <span className="text-xs font-semibold text-amber-800 dark:text-amber-400 block mb-1">
                          Warnings ({q.extraction_warnings.length})
                        </span>
                        <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                          {q.extraction_warnings.map((w: string, index: number) => (
                            <li key={index}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-700 pt-3">
                      <Link to={`/questions/${q.id}/edit`}>
                        <Button variant="ghost" size="sm" leftIcon={<Edit className="w-4 h-4" />}>
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                        leftIcon={<Trash2 className="w-4 h-4" />}
                        onClick={() => handleDelete(q.id)}
                      >
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        leftIcon={<Share2 className="w-4 h-4" />}
                        onClick={() => {
                          setSelectedIds([q.id]);
                          setPublishingBankId(allowedBanks[0]?._id || '');
                          setShowPublishModal(true);
                        }}
                      >
                        Publish
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Publish to Bank Modal */}
      <Modal
        title="Publish Questions to Bank"
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
      >
        <div className="space-y-4">
          <Alert variant="info" title="Publishing rules">
            Publishing updates visibility to public and links the questions to the selected question bank.
            {isFaculty && (
              <p className="mt-1 text-xs">
                As a faculty member, you can only publish into your own <strong>Faculty Banks</strong> or{' '}
                <strong>Custom Banks</strong>.
              </p>
            )}
          </Alert>

          {allowedBanks.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                You do not have any banks you can publish into.
              </p>
              <Link to="/question-banks">
                <Button size="sm">Create Question Bank</Button>
              </Link>
            </div>
          ) : (
            <>
              <Select
                label="Target Question Bank"
                options={allowedBanks.map(b => ({
                  value: b._id,
                  label: `${b.name} (${b.type.toUpperCase()})`,
                }))}
                value={publishingBankId}
                onChange={e => setPublishingBankId(e.target.value)}
              />

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
                <Button variant="ghost" onClick={() => setShowPublishModal(false)} disabled={isPublishing}>
                  Cancel
                </Button>
                <Button onClick={handlePublish} isLoading={isPublishing} disabled={!publishingBankId}>
                  Confirm & Publish
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
