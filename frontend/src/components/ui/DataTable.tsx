import React from 'react';
import { LoadingSkeleton } from './Loading';

interface DataTableHeader {
  label: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

interface DataTableProps {
  headers: DataTableHeader[];
  children: React.ReactNode;
  isLoading?: boolean;
  loadingRows?: number;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  className?: string;
}

export function DataTable({
  headers,
  children,
  isLoading = false,
  loadingRows = 5,
  emptyMessage = 'No data found',
  emptyIcon,
  className = '',
}: DataTableProps) {
  const alignClass = (align?: string) => {
    switch (align) {
      case 'center': return 'text-center';
      case 'right': return 'text-right';
      default: return 'text-left';
    }
  };

  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            {headers.map((header, i) => (
              <th
                key={i}
                className={`px-4 py-3 font-medium text-slate-500 dark:text-slate-400 ${alignClass(header.align)} ${header.className || ''}`}
              >
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {isLoading ? (
            Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i}>
                {headers.map((_, j) => (
                  <td key={j} className="px-4 py-3">
                    <LoadingSkeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))
          ) : (
            children
          )}
        </tbody>
      </table>
      {!isLoading && !React.Children.count(children) && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {emptyIcon && <div className="text-slate-300 dark:text-slate-600 mb-3">{emptyIcon}</div>}
          <p className="text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>
        </div>
      )}
    </div>
  );
}
