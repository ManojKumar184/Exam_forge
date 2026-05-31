import { useEffect, useRef } from 'react';
import renderMathInElement from 'katex/dist/contrib/auto-render';
import { MathJax } from 'better-react-mathjax';
import { getMathRenderer } from '../../config/mathRenderer';
import { splitContentParts, hasRenderableMath } from '../../lib/latexParts';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { decodeHtmlEntities } from '../../utils/wordHtmlCleanup';
import { MathRenderer } from '../math/MathRenderer';
import type { Question, QuestionOption } from '../../types';

interface MathContentWrapperProps {
  children: React.ReactNode;
  triggerText?: string | null;
  className?: string;
}

export function MathContentWrapper({ children, triggerText, className = '' }: MathContentWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engine = getMathRenderer();

  useEffect(() => {
    if (engine === 'katex' && containerRef.current) {
      try {
        renderMathInElement(containerRef.current, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true },
          ],
          throwOnError: false,
        });
      } catch (err) {
        console.error('KaTeX auto-render failed:', err);
      }
    }
  }, [triggerText, engine]);

  const content = (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );

  if (engine === 'mathjax') {
    return <MathJax dynamic>{content}</MathJax>;
  }
  return content;
}


interface RichContentProps {
  text?: string | null;
  latex?: string | null;
  images?: string[];
  imageMetadata?: Question['image_metadata'];
  diagrams?: Question['diagrams'];
  tables?: { html?: string }[];
  className?: string;
  compact?: boolean;
}

function renderTextWithMath(text: string, compact?: boolean) {
  const decoded = decodeHtmlEntities(text);
  const parts = splitContentParts(decoded);
  if (parts.length === 1 && parts[0].type === 'text' && !hasRenderableMath(decoded)) {
    return <span className="whitespace-pre-wrap break-words leading-snug">{decoded}</span>;
  }

  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.type === 'math') {
          return (
            <MathRenderer
              key={i}
              latex={part.value}
              display={part.display}
              className={compact ? 'text-sm' : undefined}
            />
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
}

export function RichContent({
  text,
  latex,
  images = [],
  imageMetadata = [],
  diagrams = [],
  className = '',
  compact = false,
}: RichContentProps) {
  const orderedImages = [
    ...imageMetadata
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((m) => m.url),
    ...images,
    ...diagrams
      .filter((d) => d && typeof d === 'object' && 'url' in d && (d as { url?: string }).url)
      .map((d) => (d as { url: string }).url),
  ].filter((url, idx, arr) => url && arr.indexOf(url) === idx);

  const primaryText = decodeHtmlEntities(text || '');
  const blockLatex = latex?.trim();
  const hasHtmlMarkup = /<(table|img|p|div|span|br|sup|sub)\b/i.test(primaryText);

  return (
    <MathContentWrapper triggerText={primaryText + blockLatex} className={`rich-content space-y-1.5 min-w-0 ${className}`}>
      {blockLatex && !primaryText.includes('$') ? (
        <MathRenderer latex={blockLatex} display className={compact ? 'text-sm' : undefined} />
      ) : null}
      {primaryText ? (
        <div
          className={`${compact ? 'text-sm' : 'text-base'} overflow-x-auto prose prose-sm dark:prose-invert max-w-none [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-1`}
        >
          {hasHtmlMarkup ? (
            <div dangerouslySetInnerHTML={{ __html: primaryText }} />
          ) : (
            renderTextWithMath(primaryText, compact)
          )}
        </div>
      ) : null}
      {orderedImages.map((src, i) => (
        <figure key={`${src}-${i}`} className="my-2">
          <img
            src={resolveMediaUrl(src)}
            alt={`Figure ${i + 1}`}
            className="max-w-full max-h-44 md:max-h-56 object-contain rounded-lg border border-slate-200 dark:border-slate-600 w-auto"
            loading="lazy"
          />
        </figure>
      ))}
    </MathContentWrapper>
  );
}

export function RichOptionContent({ option, index, isCorrect }: { option: QuestionOption | string; index: number; isCorrect?: boolean }) {
  if (typeof option === 'string') {
    const hasHtml = /<(table|img|p|div|span|br)\b/i.test(option);
    return (
      <MathContentWrapper triggerText={option} className={`break-words ${isCorrect ? 'text-green-600 dark:text-green-400 font-medium' : ''}`}>
        <span className="font-semibold mr-2">{String.fromCharCode(65 + index)}.{isCorrect && ' ✓'}</span>
        {hasHtml ? (
          <span
            className="prose prose-sm dark:prose-invert max-w-none inline"
            dangerouslySetInnerHTML={{ __html: option }}
          />
        ) : (
          renderTextWithMath(option, true)
        )}
      </MathContentWrapper>
    );
  }

  const optText = option.text || '';
  const hasHtml = /<(table|img|p|div|span|br)\b/i.test(optText);

  return (
    <MathContentWrapper triggerText={optText} className={`flex items-start gap-2 min-w-0 w-full ${isCorrect ? 'text-green-600 dark:text-green-400 font-medium bg-green-50/50 dark:bg-green-950/10 p-1.5 rounded-lg border border-green-200/50 dark:border-green-800/30 shadow-sm' : ''}`}>
      <span className="font-semibold shrink-0">{String.fromCharCode(65 + index)}.{isCorrect && ' ✓'}</span>
      <div className="flex-1 min-w-0">
        {hasHtml ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-1 inline-block"
            dangerouslySetInnerHTML={{ __html: optText }}
          />
        ) : (
          <RichContent
            text={optText}
            latex={option.latex}
            images={option.image ? [option.image] : []}
            className={isCorrect ? '[&_.rich-content]:text-green-600 dark:[&_.rich-content]:text-green-400' : ''}
            compact
          />
        )}
        {option.image && !optText.includes(option.image) && (
          <img
            src={resolveMediaUrl(option.image)}
            alt=""
            className="mt-1 max-h-32 rounded border border-slate-200 dark:border-slate-600"
          />
        )}
      </div>
    </MathContentWrapper>
  );
}

export function QuestionContentPreview({
  question,
  compact,
  showOptions,
  showCorrect,
  showExplanation,
}: {
  question: Question;
  compact?: boolean;
  showOptions?: boolean;
  showCorrect?: boolean;
  showExplanation?: boolean;
}) {
  const opts = (question.options || []).filter((o) => o?.text?.trim());
  return (
    <div className="space-y-2">
      <RichContent
        text={question.question_text}
        latex={question.question_latex}
        images={question.question_images}
        imageMetadata={question.image_metadata}
        diagrams={question.diagrams}
        compact={compact}
      />
      {showOptions && opts.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          {opts.map((opt, idx) => (
            <RichOptionContent
              key={idx}
              option={opt}
              index={idx}
              isCorrect={showCorrect && question.correct_option === idx}
            />
          ))}
        </div>
      )}
      {showCorrect && question.question_type === 'numerical' && question.numerical_answer !== null && question.numerical_answer !== undefined && (
        <div className="mt-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded border border-emerald-200/50 dark:border-emerald-800/30">
          Correct Answer: {question.numerical_answer}
          {Number(question.numerical_tolerance || 0) > 0 && ` (±${question.numerical_tolerance})`}
        </div>
      )}
      {showCorrect && question.question_type === 'descriptive' && question.answer_text && (
        <div className="mt-2 p-2.5 bg-slate-50 dark:bg-slate-800/30 rounded border border-slate-200 dark:border-slate-750 text-xs">
          <span className="font-semibold text-slate-500 dark:text-slate-400 block uppercase mb-1 text-[10px]">Model Answer / Reference Key</span>
          <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{question.answer_text}</p>
        </div>
      )}
      {showExplanation && question.explanation && (
        <div className="mt-2 p-2.5 bg-indigo-50/60 dark:bg-indigo-950/20 rounded border border-indigo-100/50 dark:border-indigo-900/40 text-xs">
          <span className="font-semibold text-indigo-900 dark:text-indigo-400 block uppercase mb-1 text-[10px]">Explanation</span>
          <p className="text-indigo-950 dark:text-indigo-200 leading-relaxed whitespace-pre-wrap">
            {question.explanation}
          </p>
        </div>
      )}
    </div>
  );
}

