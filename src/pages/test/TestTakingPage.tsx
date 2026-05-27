import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, Button, Badge, Loading, Modal, Alert } from '../../components/ui';
import {
  autosaveTestApi,
  autoSubmitTestApi,
  fetchTestApi,
  fetchTestAttemptsApi,
  startTestApi,
  submitTestApi,
} from '../../api/tests';
import { useAuth } from '../../hooks/useAuth';
import {
  clearTestSession,
  loadTestSession,
  saveTestSession,
} from '../../utils/testSessionStorage';
import { Input, Textarea } from '../../components/ui';
import { QuestionContentPreview, RichOptionContent } from '../../components/content/RichContent';
import {
  Clock, ChevronLeft, ChevronRight, Flag, Trophy
} from 'lucide-react';
import type { Question, TestAttempt, OnlineTest, QuestionOption } from '../../types';

interface QuestionWithOrder {
  id: string;
  question: Question;
  order_index: number;
  shuffled_options?: number[];
  user_answer?: number;
  text_answer?: string;
  numerical_answer?: number | string;
  is_marked: boolean;
  is_visited: boolean;
  marks: number;
  time_spent_seconds: number;
  is_correct?: boolean | null;
  marks_obtained?: number;
  grading_remarks?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  answered: 'bg-green-500 text-white',
  marked: 'bg-purple-500 text-white',
  'not-visited': 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300',
  'marked-answered': 'bg-blue-500 text-white',
  'not-answered': 'bg-red-500 text-white',
  'review-correct': 'bg-emerald-500 text-white hover:bg-emerald-600',
  'review-incorrect': 'bg-rose-500 text-white hover:bg-rose-600',
  'review-skipped': 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-400',
  'review-pending': 'bg-amber-500 text-white hover:bg-amber-600',
};

export function TestTakingPage() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isInitialized } = useAuth();
  const isReviewMode = location.pathname.endsWith('/review');

  const [test, setTest] = useState<OnlineTest | null>(null);
  const [questions, setQuestions] = useState<QuestionWithOrder[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [attempt, setAttempt] = useState<TestAttempt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    maxScore: number;
    percentage: string;
    correct: number;
    wrong: number;
    skipped: number;
    timeTaken: number;
    autoSubmitted?: boolean;
  } | null>(null);

  const questionsRef = useRef(questions);
  const timeLeftRef = useRef(timeLeft);
  const testRef = useRef(test);
  const submittingRef = useRef(false);
  const questionEnteredAtRef = useRef<number>(Date.now());
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  useEffect(() => {
    testRef.current = test;
  }, [test]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuthenticated) {
      navigate('/login', { replace: true, state: { from: location.pathname } });
      return;
    }
    loadTest();
  }, [testId, isInitialized, isAuthenticated, isReviewMode]);

  useEffect(() => {
    if (!testId || isReviewMode || !attempt || timeLeft <= 0) return;
    saveTestSession(testId, { timeLeft, currentIndex });
  }, [testId, timeLeft, currentIndex, attempt, isReviewMode]);

  useEffect(() => {
    questionEnteredAtRef.current = Date.now();
  }, [currentIndex]);

  useEffect(() => {
    if (isReviewMode || !attempt || !test || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          void finalizeSubmit(true);
          return 0;
        }
        const next = prev - 1;
        if (next % 30 === 0) {
          void persistProgress();
        }
        if (next === 300) {
          alert('5 minutes remaining!');
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isReviewMode, attempt?.id, test?.id]);

  useEffect(() => {
    if (isReviewMode) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isReviewMode]);

  const mapSavedAnswer = (saved?: NonNullable<TestAttempt['answers']>[number]) => {
    const hasMcq = saved?.selected_option !== null && saved?.selected_option !== undefined;
    const hasText = Boolean(saved?.text_answer);
    const hasNum = saved?.numerical_answer !== null && saved?.numerical_answer !== undefined;
    return {
      user_answer: hasMcq ? saved!.selected_option! : undefined,
      text_answer: saved?.text_answer ?? undefined,
      numerical_answer: hasNum ? saved!.numerical_answer! : undefined,
      is_visited: hasMcq || hasText || hasNum,
      time_spent_seconds: saved?.time_spent_seconds ?? 0,
      is_correct: saved?.is_correct ?? null,
      marks_obtained: saved?.marks_obtained ?? 0,
      grading_remarks: saved?.grading_remarks ?? null,
    };
  };

  const buildQuestionsFromPaper = (
    testData: OnlineTest,
    attemptData: TestAttempt
  ): QuestionWithOrder[] => {
    const paperQuestions = testData.paper?.questions || [];
    return paperQuestions.map((pq, index) => {
      const saved = attemptData.answers?.find((a) => a.question_id === pq.question_id);
      const mapped = mapSavedAnswer(saved);
      return {
        id: pq.question_id,
        question: pq.question as Question,
        order_index: index,
        ...mapped,
        is_marked: saved?.is_marked_for_review ?? false,
        marks: pq.custom_marks || pq.question?.marks || 4,
      };
    });
  };

  const getQuestionTimeSpent = (q: QuestionWithOrder) => {
    const delta = Math.floor((Date.now() - questionEnteredAtRef.current) / 1000);
    return (q.time_spent_seconds || 0) + Math.max(0, delta);
  };

  const buildAutosaveAnswers = (list: QuestionWithOrder[]) =>
    list.map((q) => ({
      question_id: q.id,
      selected_option: typeof q.user_answer === 'number' ? q.user_answer : null,
      text_answer: q.text_answer ?? null,
      numerical_answer:
        q.numerical_answer !== undefined && q.numerical_answer !== ''
          ? Number(q.numerical_answer)
          : null,
      is_marked_for_review: q.is_marked,
      time_spent_seconds:
        q.id === list[currentIndexRef.current]?.id ? getQuestionTimeSpent(q) : q.time_spent_seconds,
    }));

  const loadTest = async () => {
    if (!testId) return;
    setIsLoading(true);
    try {
      if (isReviewMode) {
        const [testData, attempts] = await Promise.all([
          fetchTestApi(testId),
          fetchTestAttemptsApi(testId),
        ]);
        const submitted = attempts.find(
          (a) => a.status === 'submitted' || a.status === 'auto_submitted'
        );
        if (!submitted) {
          navigate('/tests');
          return;
        }
        setTest(testData);
        setAttempt(submitted);
        setQuestions(buildQuestionsFromPaper(testData, submitted));
        setTimeLeft(0);
        return;
      }

      const started = await startTestApi(testId);
      const testData = started.test;
      setTest(testData);
      setAttempt(started.attempt);

      const serverElapsed = started.attempt.time_spent_seconds || 0;
      const fullDuration = testData.duration_minutes * 60;
      const session = loadTestSession(testId);
      let initialTime = Math.max(0, fullDuration - serverElapsed);
      if (session && session.timeLeft > 0 && session.timeLeft <= fullDuration) {
        initialTime = Math.min(initialTime, session.timeLeft);
      }
      setTimeLeft(initialTime);
      if (session?.currentIndex != null && session.currentIndex < (testData.paper?.questions?.length || 0)) {
        setCurrentIndex(session.currentIndex);
      }

      const paperQuestions = testData.paper?.questions || [];
      const questionsWithShuffled: QuestionWithOrder[] = paperQuestions.map((pq, index) => {
        let shuffledOptions;
        if (testData.shuffle_options && pq.question?.options) {
          const optCount = (pq.question.options as unknown[]).length;
          shuffledOptions = [...Array(optCount).keys()].sort(() => Math.random() - 0.5);
        }
        const saved = started.attempt.answers?.find((a) => a.question_id === pq.question_id);
        const mapped = mapSavedAnswer(saved);
        return {
          id: pq.question_id,
          question: pq.question as Question,
          order_index: index,
          shuffled_options: shuffledOptions,
          ...mapped,
          is_marked: saved?.is_marked_for_review ?? false,
          marks: pq.custom_marks || pq.question?.marks || 4,
        };
      });
      setQuestions(questionsWithShuffled);
    } catch (error) {
      console.error('Error loading test:', error);
      navigate('/tests');
    } finally {
      setIsLoading(false);
    }
  };

  const persistProgress = useCallback(async () => {
    if (!testId || isReviewMode) return;
    const currentTest = testRef.current;
    const elapsed = currentTest
      ? currentTest.duration_minutes * 60 - timeLeftRef.current
      : 0;

    await autosaveTestApi(testId, {
      answers: buildAutosaveAnswers(questionsRef.current),
      time_spent_seconds: Math.max(0, elapsed),
    });
  }, [testId, isReviewMode]);

  const applySubmitResult = (submitted: TestAttempt, autoSubmitted: boolean) => {
    const currentTest = testRef.current;
    const timeTaken = submitted.time_spent_seconds
      ?? (currentTest ? currentTest.duration_minutes * 60 - timeLeftRef.current : 0);

    setResult({
      score: submitted.score,
      maxScore: submitted.max_score,
      percentage: submitted.percentage.toFixed(1),
      correct: submitted.correct_answers,
      wrong: submitted.wrong_answers,
      skipped: submitted.skipped_answers,
      timeTaken,
      autoSubmitted,
    });
    setShowResultModal(true);
  };

  const finalizeSubmit = useCallback(
    async (auto = false) => {
      if (!testId || isReviewMode || submittingRef.current) return;
      submittingRef.current = true;
      setIsLoading(true);
      setShowSubmitModal(false);

      try {
        await persistProgress();
        const submitted = auto ? await autoSubmitTestApi(testId) : await submitTestApi(testId);
        clearTestSession(testId);
        applySubmitResult(submitted, auto);
      } catch (error) {
        console.error('Submit failed:', error);
        alert('Failed to submit test. Please try again.');
      } finally {
        submittingRef.current = false;
        setIsLoading(false);
      }
    },
    [testId, isReviewMode, persistProgress]
  );

  const syncAnswer = async (patch: Partial<QuestionWithOrder>) => {
    if (isReviewMode) return;
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === currentIndex
          ? {
              ...q,
              ...patch,
              is_visited: true,
              time_spent_seconds: getQuestionTimeSpent(q),
            }
          : q
      )
    );
    questionEnteredAtRef.current = Date.now();

    if (testId) {
      const q = { ...questionsRef.current[currentIndex], ...patch };
      await autosaveTestApi(testId, {
        answers: [
          {
            question_id: q.id,
            selected_option: typeof q.user_answer === 'number' ? q.user_answer : null,
            text_answer: q.text_answer ?? null,
            numerical_answer:
              q.numerical_answer !== undefined && q.numerical_answer !== ''
                ? Number(q.numerical_answer)
                : null,
            is_marked_for_review: q.is_marked,
            time_spent_seconds: getQuestionTimeSpent(q),
          },
        ],
        time_spent_seconds: testRef.current
          ? testRef.current.duration_minutes * 60 - timeLeftRef.current
          : 0,
      });
    }
  };

  const handleAnswer = async (optionIndex: number) => {
    await syncAnswer({ user_answer: optionIndex });
  };

  const handleNumericalAnswer = async (value: string) => {
    await syncAnswer({ numerical_answer: value });
  };

  const handleTextAnswer = async (value: string) => {
    await syncAnswer({ text_answer: value });
  };

  const handleMark = async () => {
    if (isReviewMode) return;
    const nextMarked = !questions[currentIndex].is_marked;
    setQuestions((prev) =>
      prev.map((q, i) => (i === currentIndex ? { ...q, is_marked: nextMarked } : q))
    );
    if (testId) {
      await autosaveTestApi(testId, {
        answers: [
          {
            question_id: questions[currentIndex].id,
            selected_option:
              typeof questions[currentIndex].user_answer === 'number'
                ? questions[currentIndex].user_answer
                : null,
            is_marked_for_review: nextMarked,
          },
        ],
      });
    }
  };

  const isAnswered = (q: QuestionWithOrder) =>
    q.user_answer !== undefined ||
    Boolean(q.text_answer?.trim()) ||
    (q.numerical_answer !== undefined && q.numerical_answer !== '');

  const getQuestionStatus = (q: QuestionWithOrder): string => {
    if (isReviewMode) {
      if (q.question.question_type === 'descriptive') {
        if (!q.text_answer?.trim()) return 'review-skipped';
        if (q.is_correct === true) return 'review-correct';
        if (q.is_correct === false) return 'review-incorrect';
        return 'review-pending';
      }
      if (q.is_correct === true) return 'review-correct';
      if (q.is_correct === false) return 'review-incorrect';
      return 'review-skipped';
    }

    if (isAnswered(q)) {
      if (q.is_marked) return 'marked-answered';
      return 'answered';
    }
    if (q.is_marked) return 'marked';
    if (q.is_visited) return 'not-answered';
    return 'not-visited';
  };

  const handleSubmit = (confirmed = false) => {
    if (isReviewMode) return;
    if (!confirmed) {
      setShowSubmitModal(true);
      return;
    }
    void finalizeSubmit(false);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isInitialized || isLoading || !test) {
    return <Loading fullScreen text={isReviewMode ? 'Loading review...' : 'Loading test...'} />;
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Alert variant="warning" title="No questions">
          This test has no questions configured.
        </Alert>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const options = currentQuestion.question.options as QuestionOption[];
  const displayOptions = currentQuestion.shuffled_options
    ? currentQuestion.shuffled_options.map((i) => ({ originalIndex: i, option: options[i] }))
    : options.map((opt, i) => ({ originalIndex: i, option: opt }));

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <div className="sticky top-0 z-20 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-slate-900 dark:text-white">
              {test.test_code}
              {isReviewMode && (
                <Badge className="ml-2" variant="info" size="sm">
                  Review
                </Badge>
              )}
            </h1>
            <p className="text-sm text-slate-500">
              Question {currentIndex + 1} of {questions.length}
            </p>
          </div>
          {!isReviewMode && (
            <div
              className={`px-4 py-2 rounded-lg ${
                timeLeft < 300 ? 'bg-red-100 text-red-700' : 'bg-slate-100 dark:bg-slate-700'
              } flex items-center gap-2`}
            >
              <Clock className="w-5 h-5" />
              <span className="text-lg font-mono font-semibold">{formatTime(timeLeft)}</span>
            </div>
          )}
          {!isReviewMode ? (
            <Button onClick={() => handleSubmit()} variant="danger">
              Submit Test
            </Button>
          ) : (
            <Button variant="outline" onClick={() => navigate('/tests')}>
              Back to Tests
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-3 p-6">
          <div className="mb-4 flex items-center gap-3">
            <Badge size="md">Q{currentIndex + 1}</Badge>
            <Badge
              variant={
                currentQuestion.question.difficulty === 'easy'
                  ? 'success'
                  : currentQuestion.question.difficulty === 'medium'
                    ? 'warning'
                    : 'error'
              }
              size="md"
            >
              {currentQuestion.question.difficulty}
            </Badge>
            <Badge size="md">{currentQuestion.question.marks} marks</Badge>
          </div>

          <div className="mb-6">
            <QuestionContentPreview question={currentQuestion.question} />
          </div>

          {currentQuestion.question.question_type === 'mcq' && options && (
            <div className="space-y-3">
              {displayOptions.map(({ originalIndex, option }, index) => {
                const isSelected = currentQuestion.user_answer === originalIndex;
                const isCorrect = currentQuestion.question.correct_option === originalIndex;
                let optionStyle = 'border-slate-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-500';
                
                if (isReviewMode) {
                  if (isCorrect) {
                    optionStyle = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200';
                  } else if (isSelected) {
                    optionStyle = 'border-rose-500 bg-rose-50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200';
                  } else {
                    optionStyle = 'border-slate-200 dark:border-slate-700 opacity-60 cursor-default';
                  }
                } else if (isSelected) {
                  optionStyle = 'border-blue-500 bg-blue-50 dark:bg-blue-900/30';
                }

                return (
                  <button
                    key={index}
                    type="button"
                    disabled={isReviewMode}
                    onClick={() => handleAnswer(originalIndex)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${optionStyle} ${isReviewMode ? 'cursor-default' : ''}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex-1">
                        <RichOptionContent option={option} index={index} />
                      </div>
                      {isReviewMode && (
                        <div className="ml-3 flex-shrink-0">
                          {isCorrect && (
                            <span className="inline-flex items-center justify-center bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-300 animate-pulse">
                              Correct Answer
                            </span>
                          )}
                          {isSelected && !isCorrect && (
                            <span className="inline-flex items-center justify-center bg-rose-100 text-rose-800 text-xs font-bold px-2.5 py-1 rounded-full border border-rose-300">
                              Your Selection (Incorrect)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {currentQuestion.question.question_type === 'numerical' && (
            <div className="space-y-4">
              <Input
                label="Your Answer"
                type="text"
                disabled={isReviewMode}
                value={String(currentQuestion.numerical_answer ?? '')}
                onChange={(e) => handleNumericalAnswer(e.target.value)}
              />
              {isReviewMode && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="text-xs text-slate-500 font-semibold block uppercase">Correct Value</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {currentQuestion.question.numerical_answer} 
                      {Number(currentQuestion.question.numerical_tolerance) > 0 && ` (±${currentQuestion.question.numerical_tolerance})`}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 font-semibold block uppercase">Evaluation</span>
                    <div className="mt-1">
                      {currentQuestion.is_correct ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          ✓ Correct (+{currentQuestion.marks_obtained || currentQuestion.marks} Marks)
                        </span>
                      ) : currentQuestion.numerical_answer === undefined || currentQuestion.numerical_answer === null || currentQuestion.numerical_answer === '' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          ⚠ Skipped (0 Marks)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          ✗ Incorrect ({currentQuestion.marks_obtained ?? 0} Marks)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentQuestion.question.question_type === 'descriptive' && (
            <div className="space-y-4">
              <Textarea
                label="Your Answer"
                disabled={isReviewMode}
                value={currentQuestion.text_answer || ''}
                onChange={(e) => handleTextAnswer(e.target.value)}
                rows={6}
              />
              {isReviewMode && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-xs text-slate-500 font-semibold block uppercase">Model Answer / Reference Key</span>
                    <p className="mt-2 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {currentQuestion.question.answer_text || 'No reference key provided.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-indigo-50/50 dark:bg-indigo-950/10 rounded-lg border border-indigo-100 dark:border-indigo-950">
                    <div>
                      <span className="text-xs text-slate-500 font-semibold block uppercase">Marks Awarded</span>
                      <span className="text-xl font-extrabold text-indigo-700 dark:text-indigo-400">
                        {currentQuestion.marks_obtained ?? 0} / {currentQuestion.marks}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 font-semibold block uppercase">Teacher Feedback / Remarks</span>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 italic">
                        {currentQuestion.grading_remarks || 'Pending grading or no remarks provided.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {isReviewMode && (
            <div className="mt-6 p-5 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
              <h4 className="font-semibold text-indigo-900 dark:text-indigo-300 text-sm mb-2 flex items-center gap-1.5">
                <span>💡</span> Answer Explanation
              </h4>
              {currentQuestion.question.explanation ? (
                <p className="text-sm text-indigo-950 dark:text-indigo-200 leading-relaxed whitespace-pre-wrap">
                  {currentQuestion.question.explanation}
                </p>
              ) : (
                <p className="text-sm text-slate-500 italic">No explanation available for this question.</p>
              )}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-700">
            <Button
              variant="outline"
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              leftIcon={<ChevronLeft className="w-4 h-4" />}
            >
              Previous
            </Button>
            {!isReviewMode && (
              <Button
                variant={currentQuestion.is_marked ? 'secondary' : 'outline'}
                onClick={handleMark}
                leftIcon={<Flag className="w-4 h-4" />}
              >
                {currentQuestion.is_marked ? 'Unmark' : 'Mark for Review'}
              </Button>
            )}
            <Button
              onClick={() => setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1))}
              disabled={currentIndex === questions.length - 1}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Next
            </Button>
          </div>
        </Card>

        <Card className="p-4 h-fit sticky top-24">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Question Palette</h3>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, index) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={`w-10 h-10 rounded-lg font-medium text-sm ${STATUS_COLORS[getQuestionStatus(q)]}`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Modal isOpen={showSubmitModal} onClose={() => setShowSubmitModal(false)} title="Submit Test?">
        <div className="p-6 space-y-4">
          <Alert variant="warning" title="Are you sure?">
            You have {questions.filter((q) => !isAnswered(q)).length} unanswered questions.
            Once submitted, you cannot change your answers.
          </Alert>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowSubmitModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleSubmit(true)}>Submit Test</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showResultModal}
        onClose={() => navigate('/dashboard')}
        title={result?.autoSubmitted ? 'Time Up — Test Submitted' : 'Test Submitted!'}
        size="lg"
      >
        <div className="p-6 space-y-6 text-center">
          <Trophy className="w-20 h-20 mx-auto text-amber-500" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {result?.autoSubmitted ? 'Auto-submitted' : 'Congratulations!'}
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-3xl font-bold text-blue-600">{result?.score}</p>
              <p className="text-sm text-slate-500">Score</p>
            </Card>
            <Card className="p-4">
              <p className="text-3xl font-bold text-green-600">{result?.percentage}%</p>
              <p className="text-sm text-slate-500">Percentage</p>
            </Card>
            <Card className="p-4">
              <p className="text-3xl font-bold text-amber-600">{result?.correct}</p>
              <p className="text-sm text-slate-500">Correct</p>
            </Card>
          </div>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </Button>
            <Button onClick={() => navigate(`/test/${testId}/review`)}>Review Answers</Button>
            <Button variant="outline" onClick={() => navigate('/leaderboard')}>
              Leaderboard
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
