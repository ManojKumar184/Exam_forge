import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, RefreshCw, Trash2 } from 'lucide-react';
import { Badge, Input } from '../ui';
import { QuestionContentPreview } from '../content/RichContent';
import type { Question } from '../../types';

export interface SelectedQuestion extends Question {
  customMarks: number;
  customNegativeMarks?: number | null;
  sectionId: string;
  orderIndex: number;
}

interface SortableSectionQuestionsProps {
  sectionId: string;
  questions: SelectedQuestion[];
  onUpdateMarks: (sectionId: string, questionId: string, marks: number) => void;
  onUpdateNegativeMarks?: (sectionId: string, questionId: string, negMarks: number | null) => void;
  onRemove: (sectionId: string, questionId: string) => void;
  onReplace?: (sectionId: string, questionId: string) => void;
  replacingId?: string | null;
}

function SortableQuestionRow({
  question,
  index,
  sectionId,
  onUpdateMarks,
  onUpdateNegativeMarks,
  onRemove,
  onReplace,
  isReplacing,
}: {
  question: SelectedQuestion;
  index: number;
  sectionId: string;
  onUpdateMarks: (sectionId: string, questionId: string, marks: number) => void;
  onUpdateNegativeMarks?: (sectionId: string, questionId: string, negMarks: number | null) => void;
  onRemove: (sectionId: string, questionId: string) => void;
  onReplace?: (sectionId: string, questionId: string) => void;
  isReplacing?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 relative group hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
    >
      <div className="flex items-start justify-between gap-4 mb-3 pb-2 border-b border-slate-100 dark:border-slate-700 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing touch-none rounded hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
            Question {index + 1}
          </span>
          <Badge
            size="sm"
            variant={
              question.difficulty === 'easy'
                ? 'success'
                : question.difficulty === 'medium'
                  ? 'warning'
                  : 'error'
            }
          >
            {question.difficulty}
          </Badge>
          <Badge size="sm" variant="info" className="uppercase">
            {question.question_type}
          </Badge>
          {question.subject?.name && (
            <Badge size="sm" variant="default">
              {question.subject.name}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 px-3 py-1 rounded-lg border border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">Marks:</span>
              <Input
                type="number"
                value={question.customMarks.toString()}
                onChange={(e) => {
                  const marks = parseInt(e.target.value, 10) || 0;
                  onUpdateMarks(sectionId, question.id, marks);
                }}
                className="w-12 h-7 text-xs px-1 text-center font-bold"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">Neg M:</span>
              <Input
                type="number"
                value={(question.customNegativeMarks ?? '').toString()}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : Number(e.target.value);
                  onUpdateNegativeMarks?.(sectionId, question.id, val);
                }}
                placeholder="0"
                className="w-12 h-7 text-xs px-1 text-center font-semibold text-red-600 dark:text-red-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onReplace && (
              <button
                type="button"
                onClick={() => onReplace(sectionId, question.id)}
                disabled={isReplacing}
                className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded disabled:opacity-40"
                aria-label="Replace question"
                title="Regenerate this slot"
              >
                <RefreshCw className={`w-4 h-4 ${isReplacing ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(sectionId, question.id)}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded"
              aria-label="Remove question"
              title="Remove question"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="pl-0 sm:pl-8 pr-2">
        <QuestionContentPreview question={question} compact={false} showOptions={true} />
      </div>
    </div>
  );
}

export function SortableSectionQuestions({
  sectionId,
  questions,
  onUpdateMarks,
  onUpdateNegativeMarks,
  onRemove,
  onReplace,
  replacingId,
}: SortableSectionQuestionsProps) {
  const { setNodeRef } = useDroppable({
    id: sectionId,
  });

  return (
    <div
      ref={setNodeRef}
      className="min-h-[100px] space-y-3 p-3 bg-slate-50/50 dark:bg-slate-900/10 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 transition-colors"
    >
      <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        {questions.length > 0 ? (
          <div className="space-y-3">
            {questions.map((question, index) => (
              <SortableQuestionRow
                key={question.id}
                question={question}
                index={index}
                sectionId={sectionId}
                onUpdateMarks={onUpdateMarks}
                onUpdateNegativeMarks={onUpdateNegativeMarks}
                onRemove={onRemove}
                onReplace={onReplace}
                isReplacing={replacingId === question.id}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">
              No questions in this section. Drag questions here or click Add.
            </p>
          </div>
        )}
      </SortableContext>
    </div>
  );
}
