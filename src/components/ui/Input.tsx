import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          className={`
            w-full rounded-lg border transition-colors duration-200
            ${leftIcon ? 'pl-10' : 'pl-3'}
            ${rightIcon ? 'pr-10' : 'pr-3'}
            py-2 text-sm bg-white dark:bg-slate-800/50
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
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400">
            {rightIcon}
          </div>
        )}
      </div>
      {hint && !error && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
