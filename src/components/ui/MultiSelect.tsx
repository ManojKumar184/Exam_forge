import React from 'react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label?: string;
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  label,
  options,
  values,
  onChange,
  placeholder = 'Select...',
  className = '',
}: MultiSelectProps) {
  const toggle = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      onChange([...values, value]);
    }
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          {label}
        </label>
      )}
      <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-2 max-h-36 overflow-y-auto bg-white dark:bg-slate-800">
        {options.length === 0 ? (
          <p className="text-xs text-slate-500 px-1">{placeholder}</p>
        ) : (
          options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={values.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="rounded border-slate-300"
              />
              <span className="text-slate-700 dark:text-slate-300">{opt.label}</span>
            </label>
          ))
        )}
      </div>
      {values.length > 0 && (
        <p className="text-xs text-slate-500 mt-1">{values.length} selected</p>
      )}
    </div>
  );
}
