import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Button, Badge, Loading, Alert, PageHeader } from '../../components/ui';
import { QuestionContentPreview, RichOptionContent } from '../../components/content/RichContent';
import { fetchAttemptReviewApi, fetchTestAttemptsApi } from '../../api/tests';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Question, TestAnswer, TestAttempt } from '../../types';
import { formatQuestionType, getQuestionCategory } from './TestTakingPage';

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
  const [showAnswers, setShowAnswers] = useState(true);
  const [allowReview, setAllowReview] = useState(true);

  useEffect(() => {
    if (!testId) return;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const attempts = await fetchTestAttemptsApi(testId);
        const submittedAttempts = attempts.filter(
          (a) => a.status === 'submitted' || a.status === 'auto_submitted'
        );
        if (submittedAttempts.length === 0) {
          setError('No submitted attempt found for this test.');
          return;
        }
        const submitted = submittedAttempts[0];
        const detail = await fetchAttemptReviewApi(testId, submitted.id);
        setAttempt(detail.attempt);
        setShowAnswers(detail.show_answers !== false);
        setAllowReview(detail.allow_review !== false);

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

  if (!allowReview) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Alert variant="warning" title="Review unavailable">
          Review is not allowed for this test.
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
  const resultLabel = !showAnswers
    ? 'Submitted'
    : answer?.is_correct === true
      ? 'Correct'
      : answer?.is_correct === false
        ? 'Incorrect'
        : answer?.text_answer
          ? 'Pending grading'
          : 'Skipped';

  const resultVariant = !showAnswers
    ? 'default'
    : answer?.is_correct === true ? 'success' : answer?.is_correct === false ? 'error' : 'warning';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <PageHeader
            title="Answer Review"
            subtitle={attempt ? `Score ${attempt.score}/${attempt.max_score} (${attempt.percentage}%)${attempt.grading_status === 'pending' ? ' · Descriptive grading pending' : ''}` : undefined}
            actions={
              <Button variant="outline" onClick={() => navigate('/tests')}>
                Back to Tests
              </Button>
            }
          />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-3 p-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge>Q{currentIndex + 1}</Badge>
            <Badge variant="info">
              {formatQuestionType(current.question.question_type)}
            </Badge>
            <Badge variant={resultVariant}>{resultLabel}</Badge>
            {showAnswers && (
              <Badge>
                {answer?.marks_obtained ?? 0}/{current.marks} marks
              </Badge>
            )}
          </div>
          <div className="mb-4 text-xs text-slate-500 font-semibold uppercase tracking-wide">
            [{formatQuestionType(current.question.question_type)} Question]
          </div>

          <QuestionContentPreview question={current.question} />

          {getQuestionCategory(current.question.question_type) === 'mcq' && current.question.options && (
            <div className="mt-4 space-y-3">
              {current.question.options.map((opt, idx) => {
                const isSelected = answer?.selected_option === idx;
                const isCorrect = current.question.correct_option === idx;

                let optionStyle = 'border-slate-200 dark:border-slate-700 opacity-60';

                if (showAnswers) {
                  if (isCorrect) {
                    optionStyle = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200';
                  } else if (isSelected) {
                    optionStyle = 'border-rose-500 bg-rose-50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200';
                  }
                } else if (isSelected) {
                  optionStyle = 'border-blue-500 bg-blue-50 dark:bg-blue-900/30';
                }

                return (
                  <div
                    key={idx}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all flex items-center justify-between ${optionStyle}`}
                  >
                    <div className="flex-1">
                      <RichOptionContent option={opt} index={idx} />
                    </div>
                    {showAnswers && (
                      <div className="ml-3 flex-shrink-0">
                        {isCorrect && (
                          <span className="inline-flex items-center justify-center bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-300">
                            {isSelected ? 'Correct Answer (Your Selection)' : 'Correct Answer'}
                          </span>
                        )}
                        {isSelected && !isCorrect && (
                          <span className="inline-flex items-center justify-center bg-rose-100 text-rose-800 text-xs font-bold px-2.5 py-1 rounded-full border border-rose-300">
                            Your Selection (Incorrect)
                          </span>
                        )}
                      </div>
                    )}
                    {!showAnswers && isSelected && (
                      <div className="ml-3 flex-shrink-0">
                        <span className="inline-flex items-center justify-center bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-300">
                          Your Selection
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {getQuestionCategory(current.question.question_type) === 'numerical' && (
            <div className="mt-4 space-y-4">
              <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm">
                {answer?.numerical_answer === null || answer?.numerical_answer === undefined ? (
                  <span>Status: <span className="font-semibold text-amber-600 dark:text-amber-400">Skipped</span></span>
                ) : (
                  <span>Your answer: <span className="font-semibold">{answer.numerical_answer}</span></span>
                )}
              </div>
              {showAnswers && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="text-xs text-slate-500 font-semibold block uppercase">Correct Value</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {current.question.numerical_answer}
                      {Number(current.question.numerical_tolerance) > 0 && ` (±${current.question.numerical_tolerance})`}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 font-semibold block uppercase">Evaluation</span>
                    <div className="mt-1">
                      {answer?.is_correct === true ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          ✓ Correct (+{answer?.marks_obtained ?? current.marks} Marks)
                        </span>
                      ) : answer?.numerical_answer === undefined || answer?.numerical_answer === null ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          ⚠ Skipped (0 Marks)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          ✗ Incorrect ({answer?.marks_obtained ?? 0} Marks)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {getQuestionCategory(current.question.question_type) === 'descriptive' && (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Your answer</p>
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 whitespace-pre-wrap text-sm">
                  {answer?.text_answer ? (
                    answer.text_answer
                  ) : (
                    <span className="text-slate-500 italic">Status: Skipped</span>
                  )}
                </div>
              </div>
              {showAnswers && current.question.answer_text && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-xs text-slate-500 font-semibold block uppercase">Model Answer / Reference Key</span>
                  <p className="mt-2 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {current.question.answer_text}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-indigo-50/50 dark:bg-indigo-950/10 rounded-lg border border-indigo-100 dark:border-indigo-950">
                <div>
                  <span className="text-xs text-slate-500 font-semibold block uppercase">Marks Awarded</span>
                  <span className="text-xl font-extrabold text-indigo-700 dark:text-indigo-400">
                    {answer?.marks_obtained ?? 0} / {current.marks}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-semibold block uppercase">Teacher Feedback / Remarks</span>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 italic">
                    {answer?.grading_remarks || 'Pending grading or no remarks provided.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {showAnswers && (
            <div className="mt-6 p-5 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
              <h4 className="font-semibold text-indigo-900 dark:text-indigo-300 text-sm mb-2 flex items-center gap-1.5">
                <span>💡</span> Answer Explanation
              </h4>
              {current.question.explanation ? (
                <p className="text-sm text-indigo-950 dark:text-indigo-200 leading-relaxed whitespace-pre-wrap">
                  {current.question.explanation}
                </p>
              ) : (
                <p className="text-sm text-slate-500 italic">No explanation available for this question.</p>
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
                    : showAnswers && item.answer?.is_correct === true
                      ? 'bg-green-500 text-white'
                      : showAnswers && item.answer?.is_correct === false
                        ? 'bg-red-500 text-white'
                        : item.answer?.selected_option != null || item.answer?.numerical_answer != null || item.answer?.text_answer
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800'
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
