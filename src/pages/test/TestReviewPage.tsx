import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Button, Badge, Loading, Alert } from '../../components/ui';
import { QuestionContentPreview } from '../../components/content/RichContent';
import { fetchAttemptReviewApi, fetchTestAttemptsApi } from '../../api/tests';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Question, TestAnswer, TestAttempt } from '../../types';

interface ReviewItem {
  question: Question;
  answer?: TestAnswer;
  marks: number;
}

export function TestReviewPage() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [attempt, setAttempt] = useState<TestAttempt | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!testId) return;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const attempts = await fetchTestAttemptsApi(testId);
        const submitted = attempts.find(
          (a) => a.status === 'submitted' || a.status === 'auto_submitted'
        );
        if (!submitted) {
          setError('No submitted attempt found for this test.');
          return;
        }
        const detail = await fetchAttemptReviewApi(testId, submitted.id);
        setAttempt(detail.attempt);
        const paperQs = detail.attempt.answers || [];
        const mapped: ReviewItem[] = paperQs
          .filter((a) => a.question)
          .map((a) => ({
            question: a.question as Question,
            answer: a,
            marks: a.max_marks ?? a.question?.marks ?? 0,
          }));
        setItems(mapped);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load review');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [testId]);

  if (isLoading) return <Loading fullScreen text="Loading review..." />;
  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Alert variant="error" title="Review unavailable">
          {error}
        </Alert>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/tests')}>
          Back to tests
        </Button>
      </div>
    );
  }

  const current = items[currentIndex];
  if (!current) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Alert variant="warning" title="No answers to review" />
      </div>
    );
  }

  const answer = current.answer;
  const resultLabel =
    answer?.is_correct === true
      ? 'Correct'
      : answer?.is_correct === false
        ? 'Incorrect'
        : answer?.text_answer
          ? 'Pending grading'
          : 'Skipped';

  const resultVariant =
    answer?.is_correct === true ? 'success' : answer?.is_correct === false ? 'error' : 'warning';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Answer review</h1>
            {attempt && (
              <p className="text-sm text-slate-500">
                Score {attempt.score}/{attempt.max_score} ({attempt.percentage}%)
                {attempt.grading_status === 'pending' && ' · Descriptive grading pending'}
              </p>
            )}
          </div>
          <Button variant="outline" onClick={() => navigate('/tests')}>
            Back
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-3 p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge>Q{currentIndex + 1}</Badge>
            <Badge variant={resultVariant}>{resultLabel}</Badge>
            <Badge>
              {answer?.marks_obtained ?? 0}/{current.marks} marks
            </Badge>
          </div>

          <QuestionContentPreview question={current.question} />

          {current.question.question_type === 'mcq' && answer?.selected_option != null && (
            <div className="mt-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm">
              Your choice: Option {String.fromCharCode(65 + Number(answer.selected_option))}
            </div>
          )}

          {current.question.question_type === 'numerical' && (
            <div className="mt-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm">
              Your answer: {answer?.numerical_answer ?? '—'}
            </div>
          )}

          {current.question.question_type === 'descriptive' && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Your answer</p>
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 whitespace-pre-wrap">
                {answer?.text_answer || '—'}
              </div>
              {answer?.grading_remarks && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm">
                  <span className="font-medium">Faculty feedback: </span>
                  {answer.grading_remarks}
                </div>
              )}
            </div>
          )}

          <div className="mt-8 flex justify-between pt-6 border-t border-slate-200 dark:border-slate-700">
            <Button
              variant="outline"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              leftIcon={<ChevronLeft className="w-4 h-4" />}
            >
              Previous
            </Button>
            <Button
              disabled={currentIndex >= items.length - 1}
              onClick={() => setCurrentIndex((i) => Math.min(items.length - 1, i + 1))}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Next
            </Button>
          </div>
        </Card>

        <Card className="p-4 h-fit">
          <h3 className="font-semibold mb-3">Questions</h3>
          <div className="grid grid-cols-5 gap-2">
            {items.map((item, idx) => (
              <button
                key={item.question.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`w-9 h-9 rounded text-sm font-medium ${
                  idx === currentIndex
                    ? 'bg-blue-600 text-white'
                    : item.answer?.is_correct === true
                      ? 'bg-green-500 text-white'
                      : item.answer?.is_correct === false
                        ? 'bg-red-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-600'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
