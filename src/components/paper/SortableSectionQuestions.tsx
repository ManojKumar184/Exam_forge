import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
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
  sectionId: string;
  orderIndex: number;
}

interface SortableSectionQuestionsProps {
  sectionId: string;
  questions: SelectedQuestion[];
  onReorder: (sectionId: string, questions: SelectedQuestion[]) => void;
  onUpdateMarks: (sectionId: string, questionId: string, marks: number) => void;
  onRemove: (sectionId: string, questionId: string) => void;
  onReplace?: (sectionId: string, questionId: string) => void;
  replacingId?: string | null;
}

function SortableQuestionRow({
  question,
  index,
  sectionId,
  onUpdateMarks,
  onRemove,
  onReplace,
  isReplacing,
}: {
  question: SelectedQuestion;
  index: number;
  sectionId: string;
  onUpdateMarks: (sectionId: string, questionId: string, marks: number) => void;
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
      className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg group"
    >
      <button
        type="button"
        className="mt-1 p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium text-slate-500 w-6">Q{index + 1}</span>
      <div className="flex-1 min-w-0 max-h-48 overflow-y-auto">
        <QuestionContentPreview question={question} compact />
        <div className="flex items-center gap-2 mt-1">
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
          <Badge size="sm">{question.marks}M</Badge>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={question.customMarks.toString()}
          onChange={(e) => {
            const marks = parseInt(e.target.value, 10) || 0;
            onUpdateMarks(sectionId, question.id, marks);
          }}
          className="w-16 h-8 text-sm"
        />
        {onReplace && (
          <button
            type="button"
            onClick={() => onReplace(sectionId, question.id)}
            disabled={isReplacing}
            className="p-1 text-slate-400 hover:text-blue-500 disabled:opacity-40"
            aria-label="Replace question"
            title="Regenerate this slot"
          >
            <RefreshCw className={`w-4 h-4 ${isReplacing ? 'animate-spin' : ''}`} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(sectionId, question.id)}
          className="p-1 text-slate-400 hover:text-red-500"
          aria-label="Remove question"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function SortableSectionQuestions({
  sectionId,
  questions,
  onReorder,
  onUpdateMarks,
  onRemove,
  onReplace,
  replacingId,
}: SortableSectionQuestionsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(questions, oldIndex, newIndex).map((q, i) => ({
      ...q,
      orderIndex: i,
    }));
    onReorder(sectionId, reordered);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {questions.map((question, index) => (
            <SortableQuestionRow
              key={question.id}
              question={question}
              index={index}
              sectionId={sectionId}
              onUpdateMarks={onUpdateMarks}
              onRemove={onRemove}
              onReplace={onReplace}
              isReplacing={replacingId === question.id}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
