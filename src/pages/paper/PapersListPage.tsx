import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Edit, Trash2 } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Card, Button, Badge, Loading, EmptyState, Modal, Input } from '../../components/ui';
import { FileText, Plus, PlayCircle, Calendar, Clock, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadPaperPdfApi } from '../../api/papers';
import { downloadBlob } from '../../utils/downloadBlob';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import type { Paper } from '../../types';

export function PapersListPage() {
  const navigate = useNavigate();
  const { profile, isAdmin, isFaculty } = useAuth();
  const { papers, fetchPapers, createOnlineTest, deletePaper, isLoading } = useDataStore();
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [showCreateTestModal, setShowCreateTestModal] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const [testStartTime, setTestStartTime] = useState('');
  const [testEndTime, setTestEndTime] = useState('');
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [showResults, setShowResults] = useState(true);
  const [allowReview, setAllowReview] = useState(true);
  const [showAnswers, setShowAnswers] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [accessCode, setAccessCode] = useState('');

  // PDF Export settings states
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPaperObj, setExportPaperObj] = useState<Paper | null>(null);
  const [exportType, setExportType] = useState<'paper' | 'answer_key'>('paper');
  const [exportAnswers, setExportAnswers] = useState(false);
  const [exportExplanations, setExportExplanations] = useState(false);
  const [exportQuestionTypeBadges, setExportQuestionTypeBadges] = useState(false);
  const [exportDifficulty, setExportDifficulty] = useState(false);
  const [exportSource, setExportSource] = useState(false);
  const [exportWatermark, setExportWatermark] = useState(false);
  const [exportInstituteLogo, setExportInstituteLogo] = useState(true);

  const handleExportPdf = (
    paper: Paper,
    type: 'paper' | 'answer_key'
  ) => {
    setExportPaperObj(paper);
    setExportType(type);
    setExportAnswers(type === 'answer_key');
    setExportExplanations(type === 'answer_key');
    setExportQuestionTypeBadges(false);
    setExportDifficulty(false);
    setExportSource(false);
    setExportWatermark(paper.status === 'draft');
    setExportInstituteLogo(true);
    setShowExportModal(true);
  };

  const handleExportPdfSubmit = async () => {
    if (!exportPaperObj) return;
    setExportingId(exportPaperObj.id);
    setShowExportModal(false);
    try {
      const blob = await downloadPaperPdfApi(exportPaperObj.id, {
        type: exportType,
        allowDraft: exportPaperObj.status === 'draft',
        includeAnswers: exportAnswers,
        includeExplanations: exportExplanations,
        includeQuestionTypeBadges: exportQuestionTypeBadges,
        includeDifficulty: exportDifficulty,
        includeSource: exportSource,
        includeWatermark: exportWatermark,
        includeInstituteLogo: exportInstituteLogo,
      });
      const suffix = exportType === 'answer_key' ? 'answer-key' : 'question-paper';
      downloadBlob(blob, `${exportPaperObj.paper_code || exportPaperObj.id}-${suffix}.pdf`);
      toast.success('PDF downloaded');
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setExportingId(null);
      setExportPaperObj(null);
    }
  };

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
    fetchPapers();
  }, []);

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Papers</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{papers.length} papers generated</p>
        </div>
        <Link to="/papers/new">
          <Button leftIcon={<Plus className="w-4 h-4" />}>Create Paper</Button>
        </Link>
      </div>

      {/* Papers Grid */}
      {papers.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title="No papers yet"
          description="Create your first question paper"
          action={
            <Link to="/papers/new">
              <Button leftIcon={<Plus className="w-4 h-4" />}>Create Paper</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {papers.map((paper) => {
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={exportingId === paper.id}
                      leftIcon={<Download className="w-4 h-4" />}
                      onClick={() => void handleExportPdf(paper, 'paper')}
                    >
                      Export PDF
                    </Button>
                    {canManagePaper ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                        leftIcon={<Trash2 className="w-4 h-4" />}
                        onClick={() => void handleDeletePaper(paper.id)}
                      >
                        Delete
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1"
                        disabled={exportingId === paper.id}
                        onClick={() => void handleExportPdf(paper, 'answer_key')}
                      >
                        Answer key
                      </Button>
                    )}
                  </div>
                  {canManagePaper && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-slate-500 hover:text-slate-700"
                      disabled={exportingId === paper.id}
                      onClick={() => void handleExportPdf(paper, 'answer_key')}
                    >
                      Export Answer Key
                    </Button>
                  )}
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

      {/* Export PDF Settings Modal */}
      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="PDF Export Settings"
        size="md"
      >
        <div className="p-6 space-y-6">
          <div>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Customize options for exporting: <strong>{exportPaperObj?.title}</strong>
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Export Parameters</h4>
            
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportAnswers}
                  onChange={(e) => setExportAnswers(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Include Answers</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportExplanations}
                  onChange={(e) => setExportExplanations(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Include Explanations</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportQuestionTypeBadges}
                  onChange={(e) => setExportQuestionTypeBadges(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Include Question Type Badges</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportDifficulty}
                  onChange={(e) => setExportDifficulty(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Include Difficulty</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportSource}
                  onChange={(e) => setExportSource(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Include Source</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportWatermark}
                  onChange={(e) => setExportWatermark(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Include Watermark</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportInstituteLogo}
                  onChange={(e) => setExportInstituteLogo(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Include Institute Logo</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t pt-4 dark:border-slate-700">
            <Button variant="ghost" onClick={() => setShowExportModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleExportPdfSubmit} disabled={exportingId !== null}>
              {exportingId !== null ? 'Exporting...' : 'Download PDF'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
