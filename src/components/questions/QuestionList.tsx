import { Card, Loading, EmptyState } from '../ui';

interface QuestionListProps<T = any> {
  questions: T[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  isLoading: boolean;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  renderCard: (question: T, isSelected: boolean, onToggle: () => void) => React.ReactNode;
  renderBulkActions?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  showSelection?: boolean;
}

export function QuestionList<T>({
  questions,
  selectedIds,
  onSelectionChange,
  isLoading,
  allSelected,
  onToggleSelectAll,
  renderCard,
  renderBulkActions,
  emptyTitle = 'No questions found',
  emptyDescription = 'Try adjusting your filters or upload new questions',
  emptyAction,
  showSelection = true,
}: QuestionListProps<T>) {
  if (isLoading) {
    return <Loading text="Loading questions..." />;
  }

  if (questions.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="space-y-3">
      {showSelection && (
        <div className="flex items-center gap-3 px-1 py-2 border-b border-slate-200 dark:border-slate-700">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={allSelected}
              onChange={onToggleSelectAll}
            />
            Select all on this page
          </label>
          {selectedIds.length > 0 && (
            <span className="text-sm font-medium text-slate-500">
              {selectedIds.length} selected
            </span>
          )}
        </div>
      )}

      <div className="space-y-4">
        {questions.map((question: any) => {
          const id = question.id ?? question._id;
          const isSelected = selectedIds.includes(id);
          const onToggle = () => {
            if (isSelected) {
              onSelectionChange(selectedIds.filter((sid) => sid !== id));
            } else {
              onSelectionChange([...selectedIds, id]);
            }
          };

          return renderCard(question, isSelected, onToggle);
        })}
      </div>

      {renderBulkActions && selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-40 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.08)] safe-area-pb">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {selectedIds.length} selected
            </span>
            <div className="flex flex-wrap gap-2">
              {renderBulkActions}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
