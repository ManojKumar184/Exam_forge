import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Edit, Trash2 } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Card, Button, Badge, Loading, EmptyState, Modal, Input, Select, PageHeader } from '../../components/ui';
import { FileText, Plus, PlayCircle, Calendar, Clock, Download, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import type { Paper } from '../../types';
import { fetchQuestionBanksApi, type QuestionBank } from '../../api/questionBanks';
import { fetchSyllabusTree, type SyllabusNode } from '../../api/syllabus';

export function PapersListPage() {
  const navigate = useNavigate();
  const { profile, isAdmin, isFaculty } = useAuth();
  const { papers, fetchPapers, createOnlineTest, deletePaper, isLoading } = useDataStore();
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [showCreateTestModal, setShowCreateTestModal] = useState(false);

  const [testStartTime, setTestStartTime] = useState('');
  const [testEndTime, setTestEndTime] = useState('');
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [showResults, setShowResults] = useState(true);
  const [allowReview, setAllowReview] = useState(true);
  const [showAnswers, setShowAnswers] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [accessCode, setAccessCode] = useState('');
  const [search, setSearch] = useState('');

  // Advanced Filters (Bank & Syllabus Nodes)
  const [syllabusTree, setSyllabusTree] = useState<SyllabusNode[]>([]);
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const [bankFilter, setBankFilter] = useState('');
  const [syllabusFilters, setSyllabusFilters] = useState({
    syllabus_exam_pattern_id: '',
    syllabus_class_id: '',
    syllabus_subject_id: '',
    syllabus_chapter_id: '',
    syllabus_topic_id: '',
    syllabus_subtopic_id: '',
  });

  const filteredPapers = papers.filter((paper) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const titleMatch = paper.title?.toLowerCase().includes(term);
    const codeMatch = paper.paper_code?.toLowerCase().includes(term);
    const subjectMatch = paper.subject?.name?.toLowerCase().includes(term);
    return titleMatch || codeMatch || subjectMatch;
  });



  const handleDeletePaper = async (paperId: string) => {
    if (!window.confirm('Are you sure you want to delete this question paper? This will permanently delete the paper and cannot be undone.')) {
      return;
    }
    const { error } = await deletePaper(paperId);
    if (error) {
      toast.error(error.message || 'Failed to delete paper');
    } else {
      toast.success('Paper deleted successfully');
      fetchPapers();
    }
  };

  useEffect(() => {
    async function loadMetadata() {
      try {
        const [tree, banks] = await Promise.all([
          fetchSyllabusTree(),
          fetchQuestionBanksApi()
        ]);
        setSyllabusTree(tree);
        setQuestionBanks(banks);
      } catch (err) {
        console.error('Failed to load filter metadata', err);
      }
    }
    loadMetadata();
  }, []);

  useEffect(() => {
    const apiFilters: Record<string, any> = {};
    if (bankFilter) apiFilters.bank_id = bankFilter;
    if (syllabusFilters.syllabus_subject_id) apiFilters.subject_id = syllabusFilters.syllabus_subject_id;
    if (syllabusFilters.syllabus_chapter_id) apiFilters.chapter_id = syllabusFilters.syllabus_chapter_id;
    if (syllabusFilters.syllabus_topic_id) apiFilters.topic_id = syllabusFilters.syllabus_topic_id;
    if (syllabusFilters.syllabus_subtopic_id) apiFilters.subtopic_id = syllabusFilters.syllabus_subtopic_id;

    fetchPapers(apiFilters);
  }, [bankFilter, syllabusFilters]);

  const handleCreateOnlineTest = async () => {
    if (!selectedPaper) return;

    if (testStartTime && testEndTime) {
      if (new Date(testStartTime) >= new Date(testEndTime)) {
        toast.error('Start time must be before end time');
        return;
      }
    }

    const testCode = `TEST-${Date.now().toString(36).toUpperCase()}`;

    const { data, error } = await createOnlineTest({
      paper_id: selectedPaper.id,
      test_code: testCode,
      start_time: testStartTime ? new Date(testStartTime).toISOString() : null,
      end_time: testEndTime ? new Date(testEndTime).toISOString() : null,
      duration_minutes: selectedPaper.duration_minutes,
      shuffle_questions: shuffleQuestions,
      shuffle_options: shuffleOptions,
      show_results: showResults,
      allow_review: allowReview,
      show_answers: showAnswers,
      is_public: isPublic,
      access_code: isPublic ? null : accessCode || null,
      status: 'scheduled',
    });

    if (!error && data) {
      setShowCreateTestModal(false);
      setSelectedPaper(null);
      navigate('/tests');
    }
  };

  if (isLoading) {
    return <Loading fullScreen text="Loading papers..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Papers"
        subtitle={`${papers.length} papers generated`}
        actions={
          <Link to="/papers/new">
            <Button leftIcon={<Plus className="w-4 h-4" />}>Create Paper</Button>
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-4 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap gap-4 items-center">
          <Input
            placeholder="Search papers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-slate-400" />}
            className="w-full sm:w-64"
          />
          <select
            value={bankFilter}
            onChange={(e) => setBankFilter(e.target.value)}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm h-10 w-full sm:w-48"
          >
            <option value="">All Question Banks</option>
            {questionBanks.map((bank) => (
              <option key={bank._id} value={bank._id}>
                {bank.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="w-full sm:w-48">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Exam Pattern"
              options={[
                { value: '', label: 'All Patterns' },
                ...syllabusTree.map(n => ({ value: n._id, label: n.name }))
              ]}
              value={syllabusFilters.syllabus_exam_pattern_id}
              onChange={(e) => {
                setSyllabusFilters(prev => ({
                  ...prev,
                  syllabus_exam_pattern_id: e.target.value,
                  syllabus_class_id: '',
                  syllabus_subject_id: '',
                  syllabus_chapter_id: '',
                  syllabus_topic_id: '',
                  syllabus_subtopic_id: ''
                }));
              }}
            />
          </div>
          <div className="w-full sm:w-28">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Syllabus Class"
              options={[
                { value: '', label: 'All Classes' },
                ...(syllabusTree.find(n => n._id === syllabusFilters.syllabus_exam_pattern_id)?.children || []).map(n => ({ value: n._id, label: n.name }))
              ]}
              value={syllabusFilters.syllabus_class_id}
              disabled={!syllabusFilters.syllabus_exam_pattern_id}
              onChange={(e) => {
                setSyllabusFilters(prev => ({
                  ...prev,
                  syllabus_class_id: e.target.value,
                  syllabus_subject_id: '',
                  syllabus_chapter_id: '',
                  syllabus_topic_id: '',
                  syllabus_subtopic_id: ''
                }));
              }}
            />
          </div>
          <div className="w-full sm:w-32">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Syllabus Subject"
              options={[
                { value: '', label: 'All Subjects' },
                ...((syllabusTree.find(n => n._id === syllabusFilters.syllabus_exam_pattern_id)?.children || [])
                  .find(n => n._id === syllabusFilters.syllabus_class_id)?.children || []).map(n => ({ value: n._id, label: n.name }))
              ]}
              value={syllabusFilters.syllabus_subject_id}
              disabled={!syllabusFilters.syllabus_class_id}
              onChange={(e) => {
                setSyllabusFilters(prev => ({
                  ...prev,
                  syllabus_subject_id: e.target.value,
                  syllabus_chapter_id: '',
                  syllabus_topic_id: '',
                  syllabus_subtopic_id: ''
                }));
              }}
            />
          </div>
          <div className="w-full sm:w-36">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Syllabus Chapter"
              options={[
                { value: '', label: 'All Chapters' },
                ...(((syllabusTree.find(n => n._id === syllabusFilters.syllabus_exam_pattern_id)?.children || [])
                  .find(n => n._id === syllabusFilters.syllabus_class_id)?.children || [])
                  .find(n => n._id === syllabusFilters.syllabus_subject_id)?.children || []).map(n => ({ value: n._id, label: n.name }))
              ]}
              value={syllabusFilters.syllabus_chapter_id}
              disabled={!syllabusFilters.syllabus_subject_id}
              onChange={(e) => {
                setSyllabusFilters(prev => ({
                  ...prev,
                  syllabus_chapter_id: e.target.value,
                  syllabus_topic_id: '',
                  syllabus_subtopic_id: ''
                }));
              }}
            />
          </div>
          <div className="w-full sm:w-36">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Syllabus Topic"
              options={[
                { value: '', label: 'All Topics' },
                ...((((syllabusTree.find(n => n._id === syllabusFilters.syllabus_exam_pattern_id)?.children || [])
                  .find(n => n._id === syllabusFilters.syllabus_class_id)?.children || [])
                  .find(n => n._id === syllabusFilters.syllabus_subject_id)?.children || [])
                  .find(n => n._id === syllabusFilters.syllabus_chapter_id)?.children || []).map(n => ({ value: n._id, label: n.name }))
              ]}
              value={syllabusFilters.syllabus_topic_id}
              disabled={!syllabusFilters.syllabus_chapter_id}
              onChange={(e) => {
                setSyllabusFilters(prev => ({
                  ...prev,
                  syllabus_topic_id: e.target.value,
                  syllabus_subtopic_id: ''
                }));
              }}
            />
          </div>
          <div className="w-full sm:w-36">
            <Select
              className="h-8 text-xs py-1"
              placeholder="Syllabus Subtopic"
              options={[
                { value: '', label: 'All Subtopics' },
                ...(((((syllabusTree.find(n => n._id === syllabusFilters.syllabus_exam_pattern_id)?.children || [])
                  .find(n => n._id === syllabusFilters.syllabus_class_id)?.children || [])
                  .find(n => n._id === syllabusFilters.syllabus_subject_id)?.children || [])
                  .find(n => n._id === syllabusFilters.syllabus_chapter_id)?.children || [])
                  .find(n => n._id === syllabusFilters.syllabus_topic_id)?.children || []).map(n => ({ value: n._id, label: n.name }))
              ]}
              value={syllabusFilters.syllabus_subtopic_id}
              disabled={!syllabusFilters.syllabus_topic_id}
              onChange={(e) => {
                setSyllabusFilters(prev => ({
                  ...prev,
                  syllabus_subtopic_id: e.target.value
                }));
              }}
            />
          </div>
        </div>
      </div>

      {/* Papers Grid */}
      {filteredPapers.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title={papers.length === 0 ? "No papers yet" : "No papers found"}
          description={papers.length === 0 ? "Create your first question paper" : "Try adjusting your filters"}
          action={papers.length === 0 ? (
            <Link to="/papers/new">
              <Button leftIcon={<Plus className="w-4 h-4" />}>Create Paper</Button>
            </Link>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPapers.map((paper) => {
            const canManagePaper = isAdmin || (isFaculty && paper.created_by === profile?.id);

            return (
              <Card key={paper.id} className="p-5 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{paper.title}</h3>
                    <p className="text-sm text-slate-500 mt-1">{paper.paper_code}</p>
                  </div>
                  <Badge variant={paper.status === 'published' ? 'success' : 'default'}>
                    {paper.status}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {paper.subject?.name || 'No Subject'} | Class {paper.class}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {paper.total_questions}Q | {paper.total_marks}M | {paper.duration_minutes} min
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {new Date(paper.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Link to={`/papers/${paper.id}/edit`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full" leftIcon={<Edit className="w-4 h-4" />}>
                        Edit
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      leftIcon={<PlayCircle className="w-4 h-4" />}
                      onClick={() => {
                        setSelectedPaper(paper);
                        const now = new Date();
                        const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                        const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
                        
                        const toLocalISO = (d: Date) => {
                          const pad = (n: number) => n.toString().padStart(2, '0');
                          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        };
                        
                        setTestStartTime(toLocalISO(start));
                        setTestEndTime(toLocalISO(end));
                        setShuffleQuestions(true);
                        setShuffleOptions(true);
                        setShowResults(true);
                        setAllowReview(true);
                        setIsPublic(true);
                        setAccessCode('');
                        setShowCreateTestModal(true);
                      }}
                    >
                      Create Test
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/papers/${paper.id}/export`} className="flex-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        leftIcon={<Download className="w-4 h-4" />}
                      >
                        Export Workspace
                      </Button>
                    </Link>
                    {canManagePaper ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 px-3"
                        leftIcon={<Trash2 className="w-4 h-4" />}
                        onClick={() => void handleDeletePaper(paper.id)}
                      />
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-3 text-slate-400"
                        disabled
                        leftIcon={<Trash2 className="w-4 h-4" />}
                      />
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Test Modal */}
      <Modal
        isOpen={showCreateTestModal}
        onClose={() => setShowCreateTestModal(false)}
        title="Create Online Test"
        size="lg"
      >
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          <div>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Configure access, timers, and behavior for: <strong>{selectedPaper?.title}</strong>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              type="datetime-local"
              label="Start Date & Time"
              value={testStartTime}
              onChange={(e) => setTestStartTime(e.target.value)}
            />
            <Input
              type="datetime-local"
              label="End Date & Time"
              value={testEndTime}
              onChange={(e) => setTestEndTime(e.target.value)}
            />
          </div>

          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Test Administration Rules</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Shuffle Questions</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={(e) => setShuffleOptions(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Shuffle Options (MCQs)</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showResults}
                  onChange={(e) => setShowResults(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Show Results Immediately</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowReview}
                  onChange={(e) => setAllowReview(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Allow Student Review</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAnswers}
                  onChange={(e) => setShowAnswers(e.target.checked)}
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
                  name="visibility"
                  checked={isPublic}
                  onChange={() => setIsPublic(true)}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Public Access</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={!isPublic}
                  onChange={() => setIsPublic(false)}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Protected (requires Access Code)</span>
              </label>
            </div>

            {!isPublic && (
              <Input
                type="text"
                placeholder="e.g. MATH101"
                label="Access Code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
              />
            )}
          </div>

          <div className="flex justify-end gap-3 border-t pt-4 dark:border-slate-700">
            <Button variant="ghost" onClick={() => setShowCreateTestModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOnlineTest}>
              Publish Test
            </Button>
          </div>
        </div>
      </Modal>


    </div>
  );
}
