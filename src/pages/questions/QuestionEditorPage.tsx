import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDataStore } from '../../stores/dataStore';
import { useAuth } from '../../hooks/useAuth';
import { QuestionEditorForm } from '../../components/questions/QuestionEditorForm';
import { Loading, Button } from '../../components/ui';
import { fetchQuestionApi } from '../../api/questions';
import type { Question } from '../../types';

export function QuestionEditorPage() {
  const { questionId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(questionId);
  const { isFaculty, isAdmin } = useAuth();
  const { subjects, chapters, examTypes, fetchSubjects, fetchExamTypes, fetchChapters, createQuestion, updateQuestion } =
    useDataStore();
  const [initial, setInitial] = useState<Question | null>(null);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    fetchSubjects();
    fetchExamTypes();
  }, []);

  useEffect(() => {
    if (!isEdit || !questionId) return;
    setLoading(true);
    fetchQuestionApi(questionId)
      .then(setInitial)
      .catch(() => navigate('/questions'))
      .finally(() => setLoading(false));
  }, [questionId, isEdit]);

  useEffect(() => {
    if (initial?.subject_id) fetchChapters(initial.subject_id);
  }, [initial?.subject_id]);

  if (!isFaculty && !isAdmin) {
    return (
      <div className="p-6">
        <p className="text-slate-600">You do not have permission to author questions.</p>
        <Link to="/dashboard">
          <Button className="mt-4">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  if (loading) return <Loading fullScreen text="Loading question…" />;

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {isEdit ? 'Edit question' : 'Create question'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Manual authoring with LaTeX preview</p>
        </div>
        <Link to={isAdmin ? "/questions" : "/dashboard"}>
          <Button variant="outline" size="sm">
            {isAdmin ? 'Back to bank' : 'Back to dashboard'}
          </Button>
        </Link>
      </div>

      <QuestionEditorForm
        initial={initial || undefined}
        subjects={subjects}
        chapters={chapters}
        examTypes={examTypes}
        submitLabel={isEdit ? 'Update question' : 'Create question'}
        onCancel={() => navigate(isAdmin ? '/questions' : '/dashboard')}
        onSubmit={async (payload) => {
          if (isEdit && questionId) {
            await updateQuestion(questionId, payload as Partial<Question>);
          } else {
            await createQuestion(payload as Partial<Question>);
          }
          navigate(isAdmin ? '/questions' : '/dashboard');
        }}
      />
    </div>
  );
}
