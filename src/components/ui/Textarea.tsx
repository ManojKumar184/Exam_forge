import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({ label, error, hint, className = '', id, ...props }: TextareaProps) {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`
          w-full rounded-lg border transition-colors duration-200
          px-3 py-2 text-sm min-h-[80px] resize-y bg-white dark:bg-slate-800/50
          ${error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
            : 'border-slate-300 focus:border-primary-500 focus:ring-primary-500/20'
          }
          focus:outline-none focus:ring-2
          disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
          dark:border-slate-600 dark:text-white dark:disabled:bg-slate-800
          placeholder:text-slate-400 dark:placeholder:text-slate-500
          ${className}
        `}
        {...props}
      />
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {error && <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}
