import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Edit } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Card, Button, Badge, Loading, EmptyState, Modal } from '../../components/ui';
import { FileText, Plus, Eye, PlayCircle, Calendar, Clock } from 'lucide-react';
import type { Paper } from '../../types';

export function PapersListPage() {
  const navigate = useNavigate();
  const { papers, fetchPapers, createOnlineTest, isLoading } = useDataStore();
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [showCreateTestModal, setShowCreateTestModal] = useState(false);

  useEffect(() => {
    fetchPapers();
  }, []);

  const handleCreateOnlineTest = async () => {
    if (!selectedPaper) return;

    const testCode = `TEST-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();
    const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data, error } = await createOnlineTest({
      paper_id: selectedPaper.id,
      test_code: testCode,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_minutes: selectedPaper.duration_minutes,
      shuffle_questions: true,
      shuffle_options: true,
      show_results: true,
      is_public: true,
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
          {papers.map((paper) => (
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
                    setShowCreateTestModal(true);
                  }}
                >
                  Create Test
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Test Modal */}
      <Modal
        isOpen={showCreateTestModal}
        onClose={() => setShowCreateTestModal(false)}
        title="Create Online Test"
        size="md"
      >
        <div className="p-6 space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            This will create an online test from paper: <strong>{selectedPaper?.title}</strong>
          </p>
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Duration: {selectedPaper?.duration_minutes} minutes
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Questions: {selectedPaper?.total_questions}
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowCreateTestModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOnlineTest}>
              Create Test
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
