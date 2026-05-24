import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Badge, Loading, Modal, Alert } from '../../components/ui';
import { autosaveTestApi, startTestApi, submitTestApi } from '../../api/tests';
import {
  Clock, ChevronLeft, ChevronRight, Flag, Trophy
} from 'lucide-react';
import type { Question, TestAttempt, OnlineTest } from '../../types';

interface QuestionWithOrder {
  id: string;
  question: Question;
  order_index: number;
  shuffled_options?: number[];
  user_answer?: number | number[] | string;
  is_marked: boolean;
  is_visited: boolean;
  marks: number;
}

const STATUS_COLORS: Record<string, string> = {
  'answered': 'bg-green-500 text-white',
  'marked': 'bg-purple-500 text-white',
  'not-visited': 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300',
  'marked-answered': 'bg-blue-500 text-white',
  'not-answered': 'bg-red-500 text-white',
};

export function TestTakingPage() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState<OnlineTest | null>(null);
  const [questions, setQuestions] = useState<QuestionWithOrder[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [attempt, setAttempt] = useState<TestAttempt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    loadTest();
  }, [testId]);

  useEffect(() => {
    if (!attempt || !timeLeft) return;

    const timer = setInterval(async () => {
      if (timeLeft <= 1) {
        await handleSubmit(true);
        clearInterval(timer);
      } else {
        const newTime = timeLeft - 1;
        setTimeLeft(newTime);

        if (newTime % 30 === 0) {
          await saveProgress();
        }

        if (newTime === 300) {
          alert('5 minutes remaining!');
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, attempt]);

  const loadTest = async () => {
    if (!testId) return;
    try {
      const started = await startTestApi(testId);
      const testData = started.test;
      setTest(testData);
      setAttempt(started.attempt);
      setTimeLeft(testData.duration_minutes * 60 - (started.attempt.time_spent_seconds || 0));

      const paperQuestions = testData.paper?.questions || [];
      const questionsWithShuffled: QuestionWithOrder[] = paperQuestions.map((pq, index) => {
        let shuffledOptions;
        if (testData.shuffle_options && pq.question?.options) {
          const optCount = (pq.question.options as any[]).length;
          shuffledOptions = [...Array(optCount).keys()].sort(() => Math.random() - 0.5);
        }

        return {
          id: pq.question_id,
          question: pq.question as Question,
          order_index: index,
          shuffled_options: shuffledOptions,
          user_answer: started.attempt.answers?.find((a) => a.question_id === pq.question_id)?.selected_option ?? undefined,
          is_marked: started.attempt.answers?.find((a) => a.question_id === pq.question_id)?.is_marked_for_review ?? false,
          is_visited: false,
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

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const saveProgress = async () => {
    if (!attempt || !testId) return;

    const answers = questions.map((q) => ({
      question_id: q.id,
      selected_option: typeof q.user_answer === 'number' ? q.user_answer : null,
      is_marked_for_review: q.is_marked,
      time_spent_seconds: 0,
    }));

    await autosaveTestApi(testId, { answers, time_spent_seconds: test!.duration_minutes * 60 - timeLeft });
  };

  const handleAnswer = async (optionIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === currentIndex ? { ...q, user_answer: optionIndex, is_visited: true } : q
      )
    );

    if (attempt && testId) {
      await autosaveTestApi(testId, {
        answers: [
          {
            question_id: questions[currentIndex].id,
            selected_option: optionIndex,
            is_marked_for_review: questions[currentIndex].is_marked,
            time_spent_seconds: 0,
          },
        ],
      });
    }
  };

  const handleMark = () => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === currentIndex ? { ...q, is_marked: !q.is_marked } : q
      )
    );
  };

  const getQuestionStatus = (q: QuestionWithOrder): string => {
    if (q.user_answer !== undefined) {
      if (q.is_marked) return 'marked-answered';
      return 'answered';
    }
    if (q.is_marked) return 'marked';
    if (q.is_visited) return 'not-answered';
    return 'not-visited';
  };

  const handleSubmit = async (auto = false) => {
    if (!auto && !showSubmitModal) {
      setShowSubmitModal(true);
      return;
    }

    setIsLoading(true);
    setShowSubmitModal(false);

    if (!testId) return;
    await autosaveTestApi(testId, {
      answers: questions.map((q) => ({
        question_id: q.id,
        selected_option: typeof q.user_answer === 'number' ? q.user_answer : null,
        is_marked_for_review: q.is_marked,
      })),
      time_spent_seconds: test!.duration_minutes * 60 - timeLeft,
    });

    const submitted = await submitTestApi(testId);

    setResult({
      score: submitted.score,
      maxScore: submitted.max_score,
      percentage: submitted.percentage.toFixed(1),
      correct: submitted.correct_answers,
      wrong: submitted.wrong_answers,
      skipped: submitted.skipped_answers,
      timeTaken: test!.duration_minutes * 60 - timeLeft,
    });

    setShowResultModal(true);
    setIsLoading(false);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading || !test) {
    return <Loading fullScreen text="Loading test..." />;
  }

  const currentQuestion = questions[currentIndex];
  const options = currentQuestion.question.options as any[];
  const displayOptions = currentQuestion.shuffled_options
    ? currentQuestion.shuffled_options.map(i => ({ originalIndex: i, option: options[i] }))
    : options.map((opt, i) => ({ originalIndex: i, option: opt }));

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-slate-900 dark:text-white">{test.test_code}</h1>
            <p className="text-sm text-slate-500">
              Question {currentIndex + 1} of {questions.length}
            </p>
          </div>
          <div
            className={`px-4 py-2 rounded-lg ${
              timeLeft < 300 ? 'bg-red-100 text-red-700' : 'bg-slate-100 dark:bg-slate-700'
            } flex items-center gap-2`}
          >
            <Clock className="w-5 h-5" />
            <span className="text-lg font-mono font-semibold">{formatTime(timeLeft)}</span>
          </div>
          <Button onClick={() => handleSubmit()} variant="danger">
            Submit Test
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Question */}
        <Card className="lg:col-span-3 p-6">
          <div className="mb-4 flex items-center gap-3">
            <Badge size="md">Q{currentIndex + 1}</Badge>
            <Badge variant={currentQuestion.question.difficulty === 'easy' ? 'success' : currentQuestion.question.difficulty === 'medium' ? 'warning' : 'error'} size="md">
              {currentQuestion.question.difficulty}
            </Badge>
            <Badge size="md">{currentQuestion.question.marks} marks</Badge>
            {currentQuestion.question.subject && (
              <Badge variant="info" size="md">{currentQuestion.question.subject.name}</Badge>
            )}
          </div>

          <div className="mb-6">
            <p className="text-lg text-slate-900 dark:text-white whitespace-pre-wrap">
              {currentQuestion.question.question_text}
            </p>
          </div>

          {currentQuestion.question.question_type === 'mcq' && options && (
            <div className="space-y-3">
              {displayOptions.map(({ originalIndex, option }, index) => (
                <button
                  key={index}
                  onClick={() => handleAnswer(originalIndex)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    currentQuestion.user_answer === originalIndex
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-slate-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        currentQuestion.user_answer === originalIndex
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {String.fromCharCode(65 + index)}
                    </div>
                    <span className="text-slate-900 dark:text-white">
                      {option.text || option}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-700">
            <Button
              variant="outline"
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              leftIcon={<ChevronLeft className="w-4 h-4" />}
            >
              Previous
            </Button>
            <Button
              variant={currentQuestion.is_marked ? 'secondary' : 'outline'}
              onClick={handleMark}
              leftIcon={<Flag className="w-4 h-4" />}
            >
              {currentQuestion.is_marked ? 'Unmark' : 'Mark for Review'}
            </Button>
            <Button
              onClick={() => setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1))}
              disabled={currentIndex === questions.length - 1}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Next
            </Button>
          </div>
        </Card>

        {/* Question Palette */}
        <Card className="p-4 h-fit sticky top-24">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Question Palette</h3>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, index) => (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(index)}
                className={`w-10 h-10 rounded-lg font-medium text-sm ${STATUS_COLORS[getQuestionStatus(q)]}`}
              >
                {index + 1}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2 text-xs">
            {[
              { label: 'Answered', color: 'bg-green-500' },
              { label: 'Marked', color: 'bg-purple-500' },
              { label: 'Not Visited', color: 'bg-slate-200 dark:bg-slate-600' },
              { label: 'Not Answered', color: 'bg-red-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded ${item.color}`} />
                <span className="text-slate-600 dark:text-slate-400">{item.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Submit Modal */}
      <Modal isOpen={showSubmitModal} onClose={() => setShowSubmitModal(false)} title="Submit Test?">
        <div className="p-6 space-y-4">
          <Alert variant="warning" title="Are you sure?">
            You have {questions.filter(q => q.user_answer === undefined).length} unanswered questions.
            Once submitted, you cannot change your answers.
          </Alert>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowSubmitModal(false)}>Cancel</Button>
            <Button onClick={() => handleSubmit(true)}>Submit Test</Button>
          </div>
        </div>
      </Modal>

      {/* Result Modal */}
      <Modal isOpen={showResultModal} onClose={() => navigate('/dashboard')} title="Test Submitted!" size="lg">
        <div className="p-6 space-y-6 text-center">
          <Trophy className="w-20 h-20 mx-auto text-amber-500" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Congratulations!</h2>
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
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
            <Button onClick={() => navigate('/tests')}>View All Tests</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
