import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, Button, Badge, Loading, EmptyState, Input, Textarea } from '../../components/ui';
import { QuestionContentPreview } from '../../components/content/RichContent';
import {
  fetchAttemptReviewApi,
  fetchGradingQueueApi,
  fetchTestApi,
  gradeAttemptApi,
} from '../../api/tests';
import { getApiErrorMessage } from '../../api/client';
import type { TestAnswer, TestAttempt } from '../../types';

type GradeDraft = Record<string, { marks: string; remarks: string }>;

export function TestGradingPage() {
  const { testId, attemptId } = useParams();
  const navigate = useNavigate();
  const [testCode, setTestCode] = useState('');
  const [queue, setQueue] = useState<TestAttempt[]>([]);
  const [attempt, setAttempt] = useState<TestAttempt | null>(null);
  const [drafts, setDrafts] = useState<GradeDraft>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!testId) return;
    void loadQueue();
  }, [testId]);

  useEffect(() => {
    if (!testId || !attemptId) return;
    void loadAttempt(attemptId);
  }, [testId, attemptId]);

  const loadQueue = async () => {
    if (!testId) return;
    setIsLoading(true);
    try {
      const [test, pending] = await Promise.all([fetchTestApi(testId), fetchGradingQueueApi(testId)]);
      setTestCode(test.test_code);
      setQueue(pending);
      if (!attemptId && pending[0]) {
        navigate(`/tests/${testId}/grading/${pending[0].id}`, { replace: true });
      }
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  };

  const loadAttempt = async (id: string) => {
    if (!testId) return;
    setIsLoading(true);
    try {
      const detail = await fetchAttemptReviewApi(testId, id);
      setAttempt(detail.attempt);
      const initial: GradeDraft = {};
      for (const a of detail.attempt.answers || []) {
        if (a.question?.question_type === 'descriptive' && a.text_answer) {
          initial[a.id] = {
            marks: String(a.marks_obtained ?? 0),
            remarks: a.grading_remarks ?? '',
          };
        }
      }
      setDrafts(initial);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  };

  const descriptiveAnswers = (attempt?.answers || []).filter(
    (a) => a.question?.question_type === 'descriptive' && a.text_answer
  );

  const handleSave = async () => {
    if (!testId || !attempt) return;
    setIsSaving(true);
    try {
      const grades = descriptiveAnswers.map((a) => ({
        answer_id: a.id,
        marks: Number(drafts[a.id]?.marks ?? 0),
        remarks: drafts[a.id]?.remarks || null,
      }));
      await gradeAttemptApi(testId, attempt.id, grades);
      toast.success('Grades saved');
      await loadQueue();
      if (attemptId) await loadAttempt(attemptId);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !attempt) {
    return <Loading fullScreen text="Loading grading..." />;
  }

  if (!attemptId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Grading — {testCode}</h1>
          <p className="text-slate-500 mt-1">Descriptive answers awaiting faculty review</p>
        </div>
        {queue.length === 0 ? (
          <EmptyState title="No pending grading" description="All submitted attempts are graded." />
        ) : (
          <div className="space-y-3">
            {queue.map((row) => (
              <Card key={row.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{row.user?.full_name || row.user?.email || row.user_id}</p>
                  <p className="text-sm text-slate-500">
                    Score {row.score}/{row.max_score} · {row.grading_status}
                  </p>
                </div>
                <Link to={`/tests/${testId}/grading/${row.id}`}>
                  <Button size="sm">Grade</Button>
                </Link>
              </Card>
            ))}
          </div>
        )}
        <Button variant="outline" onClick={() => navigate('/tests')}>
          Back to tests
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Grade attempt</h1>
          <p className="text-slate-500 mt-1">
            {attempt?.user?.full_name || attempt?.user?.email} · {testCode}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/tests/${testId}/grading`)}>
            Queue ({queue.length})
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save grades'}
          </Button>
        </div>
      </div>

      {descriptiveAnswers.length === 0 ? (
        <EmptyState title="No descriptive answers" description="This attempt has nothing to grade." />
      ) : (
        descriptiveAnswers.map((a: TestAnswer, idx) => (
          <Card key={a.id} className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Badge>Q{idx + 1}</Badge>
              <Badge>Max {a.max_marks ?? a.question?.marks ?? 0} marks</Badge>
              {a.graded_at && <Badge variant="success">Graded</Badge>}
            </div>
            {a.question && <QuestionContentPreview question={a.question} />}
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 whitespace-pre-wrap">
              {a.text_answer}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Marks awarded"
                type="number"
                min={0}
                max={a.max_marks ?? a.question?.marks ?? 0}
                value={drafts[a.id]?.marks ?? '0'}
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    [a.id]: { ...d[a.id], marks: e.target.value, remarks: d[a.id]?.remarks ?? '' },
                  }))
                }
              />
              <Textarea
                label="Remarks / feedback"
                rows={3}
                value={drafts[a.id]?.remarks ?? ''}
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    [a.id]: { marks: d[a.id]?.marks ?? '0', remarks: e.target.value },
                  }))
                }
              />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
