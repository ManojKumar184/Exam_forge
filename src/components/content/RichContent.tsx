import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { splitContentParts, hasRenderableMath } from '../../lib/latexParts';
import { resolveMediaUrl } from '../../utils/mediaUrl';
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
  const parts = splitContentParts(text);
  if (parts.length === 1 && parts[0].type === 'text' && !hasRenderableMath(text)) {
    return (
      <span className="whitespace-pre-wrap">{text}</span>
    );
  }

  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.type === 'math') {
          return part.display ? (
            <div key={i} className={`my-2 overflow-x-auto ${compact ? 'text-sm' : ''}`}>
              <BlockMath math={part.value} />
            </div>
          ) : (
            <InlineMath key={i} math={part.value} />
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

  const primaryText = text || '';
  const blockLatex = latex?.trim();

  return (
    <div className={`rich-content space-y-2 ${className}`}>
      {blockLatex && !primaryText.includes('$') ? (
        <div className={`overflow-x-auto ${compact ? 'text-sm' : ''}`}>
          <BlockMath math={blockLatex} />
        </div>
      ) : null}
      {primaryText ? (
        <div className={compact ? 'text-sm' : 'text-base'}>
          {renderTextWithMath(primaryText, compact)}
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
    return (
      <span>
        <span className="font-medium mr-2">{String.fromCharCode(65 + index)}.</span>
        {renderTextWithMath(option, true)}
      </span>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <span className="font-medium shrink-0">{String.fromCharCode(65 + index)}.</span>
      <div className="flex-1 min-w-0">
        <RichContent
          text={option.text}
          latex={option.latex}
          images={option.image ? [option.image] : []}
          compact
        />
      </div>
    </div>
  );
}

export function QuestionContentPreview({ question, compact }: { question: Question; compact?: boolean }) {
  return (
    <RichContent
      text={question.question_text}
      latex={question.question_latex}
      images={question.question_images}
      imageMetadata={question.image_metadata}
      diagrams={question.diagrams}
      compact={compact}
    />
  );
}
