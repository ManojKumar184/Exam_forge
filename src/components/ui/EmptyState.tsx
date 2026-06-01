import React from 'react';
import { FileQuestion, Search, FolderOpen } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 mb-4 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
        {icon || <FileQuestion className="w-7 h-7" />}
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-sm">{description}</p>
      )}
      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  );
}

export function NoResultsState({ searchTerm }: { searchTerm?: string }) {
  return (
    <EmptyState
      icon={<Search className="w-7 h-7" />}
      title="No results found"
      description={searchTerm ? `No items match "${searchTerm}". Try a different search term.` : 'No items match your filters. Try adjusting your criteria.'}
    />
  );
}

export function NoDataState({ entityName }: { entityName: string }) {
  return (
    <EmptyState
      icon={<FolderOpen className="w-7 h-7" />}
      title={`No ${entityName} yet`}
      description={`Get started by creating your first ${entityName.toLowerCase()}.`}
    />
  );
}
