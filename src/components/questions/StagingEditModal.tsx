import { useState } from 'react';
import toast from 'react-hot-toast';
import { QuestionEditorForm } from './QuestionEditorForm';
import { updateStagedQuestionApi } from '../../api/uploads';
import { getApiErrorMessage } from '../../api/client';
import type { Question, QuestionType, Difficulty } from '../../types';

interface StagingEditModalProps {
  uploadId: string;
  index: number;
  question: Record<string, any>;
  onClose: () => void;
  onSaved: (data: any) => void;
}

function mapStagedToInitial(q: Record<string, any>): Partial<Question> {
  return {
    id: `staging-${q.originalIndex ?? 'edit'}`,
    question_text: q.question_text || '',
    question_type: (q.question_type || 'descriptive') as QuestionType,
    difficulty: (q.difficulty || 'medium') as Difficulty,
    class: q.class || 11,
    year: q.year || null,
    marks: q.marks ?? null,
    correct_option: q.correct_option !== undefined && q.correct_option !== null ? q.correct_option : null,
    numerical_answer: q.numerical_answer !== undefined && q.numerical_answer !== null ? q.numerical_answer : null,
    explanation: q.explanation || '',
    answer_text: q.answer_text || '',
    tags: Array.isArray(q.tags) ? q.tags : [],
    question_latex: q.question_latex || '',
    options: (q.options || []).map((o: any) => ({
      text: typeof o === 'string' ? o : o.text || '',
      latex: typeof o === 'string' ? undefined : o.latex || undefined,
    })),
    question_images: q.question_images || [],
    syllabus_mappings: q.syllabus_mappings || null,
  };
}

export function StagingEditModal({
  uploadId,
  index,
  question,
  onClose,
  onSaved,
}: StagingEditModalProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (payload: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      const data = await updateStagedQuestionApi(uploadId, index, payload);
      toast.success('Staged question updated successfully');
      onSaved(data);
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const initial = mapStagedToInitial(question);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-overlay border border-slate-200 dark:border-slate-700">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10 rounded-t-xl">
          <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
            Edit Staging Question {question.originalIndex !== undefined ? `#${question.originalIndex + 1}` : ''}
          </h2>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <QuestionEditorForm
            initial={initial}
            submitLabel={isSaving ? 'Saving...' : 'Save Changes'}
            onCancel={onClose}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
}
