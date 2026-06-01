import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDataStore } from '../../stores/dataStore';
import { useAuth } from '../../hooks/useAuth';
import { Card, Button, Badge, Loading, EmptyState, Input, Modal, Select, PageHeader } from '../../components/ui';
import { PlayCircle, Clock, Calendar, CheckCircle, Search, Plus, Edit, Trash2, Copy, ExternalLink } from 'lucide-react';
import type { OnlineTest } from '../../types';
import toast from 'react-hot-toast';

export function TestsListPage() {
  const navigate = useNavigate();
  const { profile, isAdmin, isFaculty, isStudent } = useAuth();
  const {
    onlineTests,
    fetchOnlineTests,
    fetchTestAttempts,
    testAttempts,
    isLoading,
    updateOnlineTest,
    deleteOnlineTest,
  } = useDataStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Edit test state variables
  const [selectedTest, setSelectedTest] = useState<OnlineTest | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editDuration, setEditDuration] = useState(180);
  const [editShuffleQuestions, setEditShuffleQuestions] = useState(true);
  const [editShuffleOptions, setEditShuffleOptions] = useState(true);
  const [editShowResults, setEditShowResults] = useState(true);
  const [editAllowReview, setEditAllowReview] = useState(true);
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editAccessCode, setEditAccessCode] = useState('');
  const [editStatus, setEditStatus] = useState<OnlineTest['status']>('scheduled');
  const [editMaxAttempts, setEditMaxAttempts] = useState(1);
  const [editShowAnswers, setEditShowAnswers] = useState(true);

  useEffect(() => {
    fetchOnlineTests();
    if (isStudent) {
      fetchTestAttempts();
    }
  }, [profile?.id]);

  const getTestStatus = (test: OnlineTest) => {
    const now = new Date();
    const start = test.start_time ? new Date(test.start_time) : null;
    const end = test.end_time ? new Date(test.end_time) : null;

    if (test.status === 'draft' || test.status === 'archived' || test.status === 'completed') {
      return test.status;
    }

    if (start && now < start) return 'scheduled';
    if (end && now > end) return 'completed';
    return 'active';
  };

  const filteredTests = onlineTests.filter((test) => {
    if (searchTerm && !test.test_code.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    const status = getTestStatus(test);
    if (statusFilter && status !== statusFilter) return false;
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'scheduled': return 'warning';
      case 'completed': return 'default';
      case 'draft': return 'default';
      default: return 'default';
    }
  };

  const hasAttempted = (testId: string) => {
    return testAttempts.some(a => a.test_id === testId && a.status !== 'in_progress');
  };

  const handleCopyLink = (testId: string) => {
    const link = `${window.location.origin}/test/${testId}`;
    navigator.clipboard.writeText(link)
      .then(() => {
        toast.success('Test link copied to clipboard!');
      })
      .catch(() => {
        toast.error('Failed to copy link');
      });
  };

  const handleEditClick = (test: OnlineTest) => {
    setSelectedTest(test);
    
    const toLocalISO = (isoStr: string | null) => {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    
    setEditStartTime(toLocalISO(test.start_time));
    setEditEndTime(toLocalISO(test.end_time));
    setEditDuration(test.duration_minutes);
    setEditMaxAttempts(test.max_attempts || 1);
    setEditShuffleQuestions(test.shuffle_questions !== false);
    setEditShuffleOptions(test.shuffle_options !== false);
    setEditShowResults(test.show_results !== false);
    setEditAllowReview(test.allow_review !== false);
    setEditShowAnswers(test.show_answers !== false);
    setEditIsPublic(test.is_public !== false);
    setEditAccessCode(test.access_code || '');
    setEditStatus(test.status);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTest) return;

    if (editStartTime && editEndTime) {
      if (new Date(editStartTime) >= new Date(editEndTime)) {
        toast.error('Start time must be before end time');
        return;
      }
    }

    const updates = {
      start_time: editStartTime ? new Date(editStartTime).toISOString() : null,
      end_time: editEndTime ? new Date(editEndTime).toISOString() : null,
      duration_minutes: Number(editDuration) || 0,
      max_attempts: Number(editMaxAttempts) || 1,
      shuffle_questions: editShuffleQuestions,
      shuffle_options: editShuffleOptions,
      show_results: editShowResults,
      allow_review: editAllowReview,
      show_answers: editShowAnswers,
      is_public: editIsPublic,
      access_code: editIsPublic ? null : editAccessCode || null,
      status: editStatus,
    };

    const { error } = await updateOnlineTest(selectedTest.id, updates);
    if (error) {
      toast.error(error.message || 'Failed to update test');
    } else {
      toast.success('Test updated successfully');
      setShowEditModal(false);
      setSelectedTest(null);
      fetchOnlineTests();
    }
  };

  const handleDeleteTest = async (testId: string) => {
    if (!window.confirm('Are you sure you want to delete this test? This will permanently remove the test, all student attempts, and leaderboard data.')) {
      return;
    }
    const { error } = await deleteOnlineTest(testId);
    if (error) {
      toast.error(error.message || 'Failed to delete test');
    } else {
      toast.success('Test deleted successfully');
      fetchOnlineTests();
    }
  };

  if (isLoading) {
    return <Loading fullScreen text="Loading tests..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isStudent ? 'Available Tests' : 'Online Tests'}
        subtitle={`${filteredTests.length} tests found`}
        actions={(isAdmin || isFaculty) && (
          <Link to="/papers">
            <Button leftIcon={<Plus className="w-4 h-4" />}>Create Test from Paper</Button>
          </Link>
        )}
      />

      {/* Filters */}
      <div className="flex gap-4">
        <Input
          placeholder="Search tests..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
          className="max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Tests Grid */}
      {filteredTests.length === 0 ? (
        <EmptyState
          title="No tests found"
          description={isStudent ? "No tests available at the moment" : "Create a test from an exam paper"}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTests.map((test) => {
            const status = getTestStatus(test);
            const attempted = hasAttempted(test.id);

            return (
              <Card key={test.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{test.test_code}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {test.duration_minutes} minutes
                    </p>
                  </div>
                  <Badge variant={getStatusColor(status)}>{status}</Badge>
                </div>

                <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
                  {test.start_time && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Starts: {new Date(test.start_time).toLocaleString()}
                    </div>
                  )}
                  {test.end_time && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Ends: {new Date(test.end_time).toLocaleString()}
                    </div>
                  )}
                </div>

                {isStudent ? (
                  status === 'active' && !attempted ? (
                    <Button
                      className="w-full"
                      leftIcon={<PlayCircle className="w-4 h-4" />}
                      onClick={() => navigate(`/test/${test.id}`)}
                    >
                      Start Test
                    </Button>
                  ) : attempted ? (
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" className="w-full" disabled leftIcon={<CheckCircle className="w-4 h-4" />}>
                        Completed
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => navigate(`/test/${test.id}/review`)}
                      >
                        Review answers
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="w-full" disabled>
                      {status === 'scheduled' ? 'Not Started' : 'Closed'}
                    </Button>
                  )
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<ExternalLink className="w-4 h-4" />}
                        onClick={() => window.open(`/test/${test.id}`, '_blank')}
                      >
                        Open Test
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Copy className="w-4 h-4" />}
                        onClick={() => handleCopyLink(test.id)}
                      >
                        Copy Link
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('/leaderboard', { state: { testId: test.id } })}
                      >
                        Leaderboard
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/tests/${test.id}/grading`)}
                      >
                        Grade
                      </Button>
                    </div>

                    {(isAdmin || (isFaculty && test.created_by === profile?.id)) && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Edit className="w-4 h-4" />}
                          onClick={() => handleEditClick(test)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                          leftIcon={<Trash2 className="w-4 h-4" />}
                          onClick={() => void handleDeleteTest(test.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Test Modal */}
      {selectedTest && (
        <Modal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedTest(null);
          }}
          title={`Edit Online Test - ${selectedTest.test_code}`}
          size="lg"
        >
          <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                type="datetime-local"
                label="Start Date & Time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
              />
              <Input
                type="datetime-local"
                label="End Date & Time"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                type="number"
                label="Duration (minutes)"
                value={editDuration.toString()}
                onChange={(e) => setEditDuration(parseInt(e.target.value, 10) || 0)}
              />
              <Input
                type="number"
                label="Max Attempts"
                value={editMaxAttempts.toString()}
                onChange={(e) => setEditMaxAttempts(parseInt(e.target.value, 10) || 1)}
              />
              <Select
                label="Status"
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'scheduled', label: 'Scheduled' },
                  { value: 'active', label: 'Active' },
                  { value: 'completed', label: 'Completed' },
                ]}
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as OnlineTest['status'])}
              />
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Test Administration Rules</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editShuffleQuestions}
                    onChange={(e) => setEditShuffleQuestions(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Shuffle Questions</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editShuffleOptions}
                    onChange={(e) => setEditShuffleOptions(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Shuffle Options</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editShowResults}
                    onChange={(e) => setEditShowResults(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Show Results Immediately</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editAllowReview}
                    onChange={(e) => setEditAllowReview(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Allow Student Review</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editShowAnswers}
                    onChange={(e) => setEditShowAnswers(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Show Answers & Explanations</span>
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Access Control</h4>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="editVisibility"
                    checked={editIsPublic}
                    onChange={() => setEditIsPublic(true)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Public Access</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="editVisibility"
                    checked={!editIsPublic}
                    onChange={() => setEditIsPublic(false)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Protected (Access Code)</span>
                </label>
              </div>

              {!editIsPublic && (
                <Input
                  type="text"
                  placeholder="e.g. MATH101"
                  label="Access Code"
                  value={editAccessCode}
                  onChange={(e) => setEditAccessCode(e.target.value)}
                />
              )}
            </div>

            <div className="flex justify-end gap-3 border-t pt-4 dark:border-slate-700">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedTest(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
