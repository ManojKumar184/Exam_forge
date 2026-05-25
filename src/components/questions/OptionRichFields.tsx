import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { Input } from '../ui';
import { RichOptionContent } from '../content/RichContent';
import type { QuestionOption } from '../../types';
import { autoWrapEquations } from '../../utils/equationAutoWrap';

interface OptionRichFieldsProps {
  options: QuestionOption[];
  subtype: 'mcq_single' | 'mcq_multiple';
  correctOption: number | null;
  onOptionsChange: (options: QuestionOption[]) => void;
  onCorrectChange: (idx: number | null) => void;
}

export function OptionRichFields({
  options,
  subtype,
  correctOption,
  onOptionsChange,
  onCorrectChange,
}: OptionRichFieldsProps) {
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  const updateOption = (idx: number, patch: Partial<QuestionOption>) => {
    const next = [...options];
    next[idx] = { ...next[idx], ...patch };
    onOptionsChange(next);
  };

  const attachImage = (idx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      updateOption(idx, { image: String(reader.result) });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      {options.map((opt, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-slate-200 dark:border-slate-600 p-2 space-y-2"
        >
          <div className="flex items-start gap-2">
            <span className="font-medium w-6 text-sm pt-2">{String.fromCharCode(65 + idx)}.</span>
            <div className="flex-1 min-w-0 space-y-2">
              <Input
                value={opt.text}
                onChange={(e) => {
                  const text = autoWrapEquations(e.target.value);
                  updateOption(idx, { text });
                }}
                onBlur={(e) => {
                  const text = autoWrapEquations(e.target.value);
                  updateOption(idx, { text });
                }}
                placeholder="Option text — paste equations, tables as HTML"
              />
              {opt.text?.trim() && (
                <div className="text-xs bg-slate-50 dark:bg-slate-900/50 rounded p-2">
                  <RichOptionContent option={opt} index={idx} />
                </div>
              )}
              {opt.image && (
                <img
                  src={opt.image}
                  alt={`Option ${idx + 1}`}
                  className="max-h-24 rounded border border-slate-200 dark:border-slate-600"
                />
              )}
            </div>
            {subtype === 'mcq_single' && (
              <input
                type="radio"
                name="correct"
                className="mt-2"
                checked={correctOption === idx}
                onChange={() => onCorrectChange(idx)}
                title="Correct"
              />
            )}
            <button
              type="button"
              className="p-1.5 rounded border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
              onClick={() => fileRefs.current[idx]?.click()}
              title="Add image to option"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <input
              ref={(el) => {
                fileRefs.current[idx] = el;
              }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) attachImage(idx, f);
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
