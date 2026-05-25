import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Clipboard, ScanLine } from 'lucide-react';
import { extractImagesFromHtml, sanitizePastedHtml } from '../../utils/questionPasteDetect';
import { cleanupWordHtml } from '../../utils/wordHtmlCleanup';

interface RichQuestionEditorProps {
  value: string;
  onChange: (html: string, plainFallback: string) => void;
  onImagesChange: (urls: string[]) => void;
  onPastePayload?: (payload: { html: string; plain: string; images: string[] }) => void;
  images: string[];
  placeholder?: string;
  ocrText?: string;
  onOcrTextChange?: (text: string) => void;
}

function htmlToPlain(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.innerText || div.textContent || '').replace(/\u00a0/g, ' ').trim();
}

export function RichQuestionEditor({
  value,
  onChange,
  onImagesChange,
  onPastePayload,
  images,
  placeholder = 'Paste from Word, snips, or OCR text. Equations auto-detect as $...$',
  ocrText = '',
  onOcrTextChange,
}: RichQuestionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || document.activeElement === el) return;
    if (value && el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  const syncFromDom = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    const plain = htmlToPlain(html);
    onChange(html, plain);
  }, [onChange]);

  const emitPaste = useCallback(
    (html: string, plain: string, extraImages: string[] = []) => {
      const imgs = [...new Set([...images, ...extraImages])];
      if (extraImages.length) onImagesChange(imgs);
      onPastePayload?.({ html, plain, images: imgs });
    },
    [images, onImagesChange, onPastePayload]
  );

  const addImageFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (!list.length) return;
      const readers = list.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(file);
          })
      );
      Promise.all(readers).then((dataUrls) => {
        const merged = [...images, ...dataUrls];
        onImagesChange(merged);
        const el = editorRef.current;
        const html = el?.innerHTML || value;
        const plain = el ? htmlToPlain(html) : '';
        emitPaste(html, plain, merged);
      });
    },
    [images, onImagesChange, value, emitPaste]
  );

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    const imageFiles: File[] = [];
    if (items) {
      for (let i = 0; i < items.length; i += 1) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) imageFiles.push(f);
        }
      }
    }

    const html = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');

    if (imageFiles.length && !html) {
      e.preventDefault();
      addImageFiles(imageFiles);
      return;
    }

    if (html) {
      e.preventDefault();
      const cleaned = cleanupWordHtml(html);
      const safe = cleaned.html || sanitizePastedHtml(html);
      document.execCommand('insertHTML', false, safe);
      const pastedImages = [...extractImagesFromHtml(safe), ...cleaned.images];
      setTimeout(() => {
        const el = editorRef.current;
        if (!el) return;
        const fullHtml = el.innerHTML;
        const fullPlain = htmlToPlain(fullHtml);
        onChange(fullHtml, fullPlain);
        emitPaste(fullHtml, fullPlain, pastedImages);
      }, 0);
      return;
    }

    if (plain?.trim()) {
      setTimeout(() => {
        const el = editorRef.current;
        if (!el) return;
        emitPaste(el.innerHTML, htmlToPlain(el.innerHTML), []);
      }, 0);
    }
  };

  return (
    <div className="space-y-2">
      <div
        className={`relative rounded-lg border-2 transition-colors ${
          isDragOver
            ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/20'
            : 'border-slate-200 dark:border-slate-600'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (e.dataTransfer.files?.length) addImageFiles(e.dataTransfer.files);
        }}
      >
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="min-h-[260px] max-h-[480px] overflow-y-auto p-4 text-base text-slate-900 dark:text-white focus:outline-none prose prose-sm dark:prose-invert max-w-none [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-1"
          data-placeholder={placeholder}
          onInput={syncFromDom}
          onPaste={handlePaste}
          onBlur={syncFromDom}
        />
        {!value && (
          <p className="pointer-events-none absolute left-4 top-4 text-sm text-slate-400 max-w-md">
            {placeholder}
          </p>
        )}
      </div>

      {onOcrTextChange && (
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
            <ScanLine className="w-3.5 h-3.5" />
            OCR / PDF text paste (optional)
          </label>
          <textarea
            className="w-full min-h-[72px] text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-2"
            value={ocrText}
            onChange={(e) => onOcrTextChange(e.target.value)}
            onBlur={() => {
              if (ocrText.trim()) {
                const el = editorRef.current;
                emitPaste(el?.innerHTML || value, el ? htmlToPlain(el.innerHTML) : '', images);
              }
            }}
            placeholder="Paste raw OCR output from scans; merged on reconstruct"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="w-4 h-4" />
          Add images
        </button>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500 py-1.5">
          <Clipboard className="w-3.5 h-3.5" />
          Word · snips · screenshots
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addImageFiles(e.target.files)}
        />
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((src, i) => (
            <div key={`${src.slice(0, 24)}-${i}`} className="relative group">
              <img
                src={src}
                alt={`Attachment ${i + 1}`}
                className="h-20 w-auto rounded border border-slate-200 dark:border-slate-600 object-cover"
              />
              <button
                type="button"
                className="absolute -top-1 -right-1 hidden group-hover:flex w-5 h-5 items-center justify-center rounded-full bg-red-500 text-white text-xs"
                onClick={() => onImagesChange(images.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
