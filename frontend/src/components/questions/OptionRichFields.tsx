import { useRef } from 'react';
import { ImagePlus, Trash2, Plus } from 'lucide-react';
import { Button, Textarea } from '../ui';
import { RichOptionContent } from '../content/RichContent';
import type { QuestionOption } from '../../types';
import { autoWrapEquations } from '../../utils/equationAutoWrap';

interface OptionRichFieldsProps {
  options: QuestionOption[];
  subtype: 'mcq_single' | 'mcq_multiple';
  correctOption: number | null;
  correctOptions?: number[];
  onOptionsChange: (options: QuestionOption[]) => void;
  onCorrectChange: (idx: number | null) => void;
  onCorrectOptionsChange?: (indices: number[]) => void;
}

export function OptionRichFields({
  options,
  subtype,
  correctOption,
  correctOptions,
  onOptionsChange,
  onCorrectChange,
  onCorrectOptionsChange,
}: OptionRichFieldsProps) {
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Resolve correct options for MCQ multiple selection; fallback to empty array
  const effectiveCorrectOptions = correctOptions ?? [];

  const updateOption = (idx: number, patch: Partial<QuestionOption>) => {
    const next = [...options];
    const option = { ...next[idx], ...patch };
    const blocks = [...(option.contentBlocks || [])];
    if (Object.prototype.hasOwnProperty.call(patch, 'text')) {
      const textIndex = blocks.findIndex((block) => block.type === 'text');
      if (textIndex >= 0) blocks[textIndex] = { ...blocks[textIndex], text: option.text || '' };
      else if (option.text) blocks.unshift({ type: 'text', text: option.text });
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'latex')) {
      const equationIndex = blocks.findIndex((block) => block.type === 'equation');
      if (!option.latex && equationIndex >= 0) blocks.splice(equationIndex, 1);
      else if (option.latex && equationIndex >= 0) blocks[equationIndex] = { ...blocks[equationIndex], latex: option.latex };
      else if (option.latex) blocks.push({ type: 'equation', latex: option.latex });
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'image')) {
      const imageIndex = blocks.findIndex((block) => block.type === 'image');
      if (!option.image && imageIndex >= 0) blocks.splice(imageIndex, 1);
      else if (option.image && imageIndex >= 0) blocks[imageIndex] = { ...blocks[imageIndex], assetUrl: option.image };
      else if (option.image) blocks.push({ type: 'image', assetUrl: option.image });
    }
    option.contentBlocks = blocks;
    next[idx] = option;
    onOptionsChange(next);
  };

  const attachImage = (idx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      updateOption(idx, { image: String(reader.result) });
    };
    reader.readAsDataURL(file);
  };

  const addOption = () => {
    if (options.length < 8) {
      onOptionsChange([...options, { text: '', latex: undefined, image: undefined }]);
    }
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) {
      const next = options.filter((_, i) => i !== idx);
      onOptionsChange(next);
      
      if (correctOption === idx) {
        onCorrectChange(0);
      } else if (correctOption !== null && correctOption > idx) {
        onCorrectChange(correctOption - 1);
      }

      if (onCorrectOptionsChange && correctOptions) {
        const updatedOptions = correctOptions
          .filter(i => i !== idx)
          .map(i => (i > idx ? i - 1 : i));
        onCorrectOptionsChange(updatedOptions);
      }
    }
  };

  return (
    <div className="space-y-2">
      {options.map((opt, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-2 space-y-1.5"
        >
          <div className="flex items-start gap-2">
            <span className="font-semibold w-6 text-sm pt-2 text-slate-500 dark:text-slate-400">
              {String.fromCharCode(65 + idx)}.
            </span>
            <div className="flex-1 min-w-0 space-y-1">
              <Textarea
                value={opt.text}
                onChange={(e) => {
                  const text = autoWrapEquations(e.target.value);
                  updateOption(idx, { text });
                }}
                onBlur={(e) => {
                  const text = autoWrapEquations(e.target.value);
                  updateOption(idx, { text });
                }}
                placeholder={`Option ${String.fromCharCode(65 + idx)} text`}
                className="py-1 text-sm min-h-[48px] resize-y"
                rows={1}
              />
              <Textarea
                aria-label={`Option ${String.fromCharCode(65 + idx)} equation LaTeX`}
                value={opt.latex || ''}
                onChange={(e) => updateOption(idx, { latex: e.target.value || undefined })}
                placeholder="Equation LaTeX (optional)"
                className="py-1 text-sm min-h-[40px] resize-y font-mono"
                rows={1}
              />
              {opt.text?.trim() && (
                <div className="text-[11px] bg-slate-50 dark:bg-slate-900/40 rounded p-1.5 border border-slate-100 dark:border-slate-800">
                  <RichOptionContent option={opt} index={idx} />
                </div>
              )}
              {opt.image && (
                <div className="relative inline-block mt-1 group">
                  <img
                    src={opt.image}
                    alt={`Option ${idx + 1}`}
                    className="max-h-20 rounded border border-slate-200 dark:border-slate-600"
                  />
                  <button
                    type="button"
                    className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px]"
                    onClick={() => updateOption(idx, { image: undefined })}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            {subtype === 'mcq_single' && (
              <input
                type="radio"
                name="correct"
                className="mt-2.5 h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                checked={correctOption === idx}
                onChange={() => onCorrectChange(idx)}
                title="Mark as Correct Option"
              />
            )}

            {subtype === 'mcq_multiple' && (
              <input
                type="checkbox"
                className="mt-2.5 h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                checked={effectiveCorrectOptions.includes(idx)}
                onChange={() => {
                  if (onCorrectOptionsChange && correctOptions) {
                    if (correctOptions.includes(idx)) {
                      onCorrectOptionsChange(correctOptions.filter(i => i !== idx));
                    } else {
                      onCorrectOptionsChange([...correctOptions, idx].sort());
                    }
                  } else {
                    onCorrectChange(idx);
                  }
                }}
                title="Mark as Correct Option"
              />
            )}

            <button
              type="button"
              className="mt-1 p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500"
              onClick={() => fileRefs.current[idx]?.click()}
              title="Add image to option"
            >
              <ImagePlus className="w-3.5 h-3.5" />
            </button>

            {options.length > 2 && (
              <button
                type="button"
                className="mt-1 p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 text-slate-400"
                onClick={() => removeOption(idx)}
                title="Delete option"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

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

      {options.length < 8 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addOption}
          className="w-full flex items-center justify-center gap-1.5 py-1 text-xs border-dashed text-slate-500"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Option
        </Button>
      )}
    </div>
  );
}
