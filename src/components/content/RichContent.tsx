import { splitContentParts, hasRenderableMath } from '../../lib/latexParts';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { decodeHtmlEntities } from '../../utils/wordHtmlCleanup';
import { MathRenderer } from '../math/MathRenderer';
import type { Question, QuestionOption } from '../../types';

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
    <div className={`rich-content space-y-1.5 min-w-0 ${className}`}>
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
            className="max-w-full rounded-lg border border-slate-200 dark:border-slate-600"
            loading="lazy"
          />
        </figure>
      ))}
    </div>
  );
}

export function RichOptionContent({ option, index }: { option: QuestionOption | string; index: number }) {
  if (typeof option === 'string') {
    const hasHtml = /<(table|img|p|div|span|br)\b/i.test(option);
    return (
      <span className="break-words">
        <span className="font-medium mr-2">{String.fromCharCode(65 + index)}.</span>
        {hasHtml ? (
          <span
            className="prose prose-sm dark:prose-invert max-w-none inline"
            dangerouslySetInnerHTML={{ __html: option }}
          />
        ) : (
          renderTextWithMath(option, true)
        )}
      </span>
    );
  }

  const optText = option.text || '';
  const hasHtml = /<(table|img|p|div|span|br)\b/i.test(optText);

  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="font-medium shrink-0">{String.fromCharCode(65 + index)}.</span>
      <div className="flex-1 min-w-0">
        {hasHtml ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-1"
            dangerouslySetInnerHTML={{ __html: optText }}
          />
        ) : (
          <RichContent
            text={optText}
            latex={option.latex}
            images={option.image ? [option.image] : []}
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
    </div>
  );
}

export function QuestionContentPreview({
  question,
  compact,
  showOptions,
}: {
  question: Question;
  compact?: boolean;
  showOptions?: boolean;
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
        <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-700">
          {opts.map((opt, idx) => (
            <RichOptionContent key={idx} option={opt} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}
