import { Badge, Modal } from '../ui';
import { QuestionContentPreview } from '../content/RichContent';
import type { Question } from '../../types';

interface QuestionPreviewModalProps {
  question: (Question & { originalIndex?: number }) | null;
  onClose: () => void;
  title?: string;
  showExtraFields?: boolean;
  children?: React.ReactNode;
  /** Custom badges rendered after the default badge row */
  badges?: React.ReactNode;
}

export function QuestionPreviewModal({
  question,
  onClose,
  title = 'Question Preview',
  showExtraFields = true,
  children,
  badges,
}: QuestionPreviewModalProps) {
  if (!question) return null;

  return (
    <Modal isOpen={true} onClose={onClose} title={title} size="lg">
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b dark:border-slate-750">
          {question.originalIndex !== undefined && (
            <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
              #{question.originalIndex + 1}
            </span>
          )}
          {question.serial_id && (
            <Badge variant="info" size="sm">Q-{question.serial_id}</Badge>
          )}
          <Badge variant="default" size="sm">Class {question.class}</Badge>
          {question.question_type && (
            <Badge variant="info" size="sm">
              {question.question_type.toUpperCase()}
            </Badge>
          )}
          {question.difficulty && (
            <Badge
              variant={
                question.difficulty === 'easy'
                  ? 'success'
                  : question.difficulty === 'medium'
                  ? 'info'
                  : 'error'
              }
              size="sm"
            >
              {question.difficulty.toUpperCase()}
            </Badge>
          )}
          {question.status && question.status !== 'approved' && (
            <Badge
              variant={
                question.status === 'rejected'
                  ? 'error'
                  : question.status === 'needs_review'
                  ? 'info'
                  : 'warning'
              }
              size="sm"
            >
              {question.status.toUpperCase()}
            </Badge>
          )}
          {question.status === 'approved' && (
            <Badge variant="success" size="sm">Approved</Badge>
          )}
          {badges}
        </div>

        <QuestionContentPreview
          question={question}
          showOptions
          showCorrect
          showExplanation
        />

        {children}

        {showExtraFields && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t dark:border-slate-750 text-sm">
            <div>
              <p className="text-slate-500 text-xs">Subject</p>
              <p className="font-medium text-slate-900 dark:text-white">
                {(question as any).subject_name ||
                  question.subject?.name ||
                  'N/A'}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Difficulty</p>
              <p className="font-medium text-slate-900 dark:text-white capitalize">
                {question.difficulty || 'N/A'}
              </p>
            </div>
            {question.marks != null && (
              <div>
                <p className="text-slate-500 text-xs">Marks</p>
                <p className="font-medium text-slate-900 dark:text-white">
                  {question.marks}
                </p>
              </div>
            )}
            {question.year && (
              <div>
                <p className="text-slate-500 text-xs">Year</p>
                <p className="font-medium text-slate-900 dark:text-white">
                  {question.year}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
