import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({
  label,
  error,
  options,
  placeholder,
  className = '',
  id,
  ...props
}: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={`
            w-full rounded-lg border transition-colors duration-200
            pl-3 pr-10 py-2 text-sm appearance-none bg-white dark:bg-slate-800/50
            ${error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
              : 'border-slate-300 focus:border-primary-500 focus:ring-primary-500/20'
            }
            focus:outline-none focus:ring-2
            disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
            dark:border-slate-600 dark:text-white dark:disabled:bg-slate-800
            ${className}
          `}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
