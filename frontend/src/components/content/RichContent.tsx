import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import renderMathInElement from 'katex/dist/contrib/auto-render';
import { MathJax } from 'better-react-mathjax';
import { getMathRenderer } from '../../config/mathRenderer';
import { splitContentParts, hasRenderableMath } from '../../lib/latexParts';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { decodeHtmlEntities } from '../../utils/wordHtmlCleanup';
import { MathRenderer } from '../math/MathRenderer';
import type { ContentBlock, Question, QuestionOption } from '../../types';

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


const resolveHtmlMediaUrls = (htmlStr: string | null | undefined): string => {
  if (!htmlStr) return '';
  const mediaResolved = htmlStr.replace(/(<img[^>]+src=["'])([^"']*)(["'][^>]*>)/gi, (_, prefix, src, suffix) => {
    return `${prefix}${resolveMediaUrl(src)}${suffix}`;
  });
  return DOMPurify.sanitize(mediaResolved, {
    ALLOWED_TAGS: ['p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 'sub', 'sup', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'],
    ALLOWED_ATTR: ['src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan', 'class'],
  });
};

interface RichContentProps {
  text?: string | null;
  latex?: string | null;
  images?: string[];
  imageMetadata?: Question['image_metadata'];
  diagrams?: Question['diagrams'];
  tables?: any[];
  contentBlocks?: ContentBlock[];
  className?: string;
  compact?: boolean;
}

function StructuredImage({ url, index }: { url: string; index: number }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  return (
    <figure className="my-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3">
      {!loaded && !failed && <div className="h-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" aria-label="Loading image" />}
      {failed ? <div className="grid min-h-32 place-items-center text-sm text-slate-500">Image could not be loaded</div> : (
        <button type="button" className="block w-full cursor-zoom-in" onClick={() => setZoomed(true)} aria-label="Open image preview">
          <img crossOrigin="use-credentials" src={resolveMediaUrl(url)} alt={`Question figure ${index + 1}`} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className={`mx-auto max-h-[28rem] max-w-full object-contain ${loaded ? 'block' : 'hidden'}`} />
        </button>
      )}
      {zoomed && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4" onClick={() => setZoomed(false)}>
        <button type="button" aria-label="Close image preview" className="absolute right-5 top-4 text-3xl text-white">×</button>
        <img crossOrigin="use-credentials" src={resolveMediaUrl(url)} alt={`Question figure ${index + 1} enlarged`} className="max-h-[92vh] max-w-[96vw] object-contain" />
      </div>}
    </figure>
  );
}

function StructuredTable({ block, compact }: { block: ContentBlock; compact?: boolean }) {
  return <div className="my-4 w-full overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
    <table className="min-w-full border-collapse text-sm"><tbody>{(block.rows || []).map((row, r) => <tr key={r} className={r === 0 ? 'bg-slate-50 dark:bg-slate-800/50' : ''}>
      {(row || []).map((cell, c) => cell && <td key={c} colSpan={cell.colspan || 1} rowSpan={cell.rowspan || 1} className="border border-slate-200 p-2 align-top dark:border-slate-700">
        {cell.contentBlocks?.length ? renderStructuredContent(cell.contentBlocks, compact) : cell.html ? <div dangerouslySetInnerHTML={{ __html: resolveHtmlMediaUrls(cell.html) }} /> : renderTextWithMath(cell.text || '', compact)}
      </td>)}
    </tr>)}</tbody></table>
  </div>;
}

function renderStructuredContent(blocks: ContentBlock[], compact?: boolean): React.ReactNode {
  return blocks.map((block, index) => {
    if (block.type === 'text') return <span key={index} className="whitespace-pre-wrap">{renderTextWithMath(block.text || '', compact)}</span>;
    if (block.type === 'equation') return <div key={index} className="my-2 overflow-x-auto">
      {block.latex ? <MathRenderer latex={block.latex} display={Boolean(block.displayMode)} /> : <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">MathType equation preserved for review{block.warning ? ` — ${block.warning}` : ''}{block.originalAssetUrl && <a className="ml-2 underline" href={resolveMediaUrl(block.originalAssetUrl)} target="_blank" rel="noreferrer">Open source object</a>}{block.previewAssetUrls?.map((url, i) => <StructuredImage key={i} url={url} index={i} />)}</div>}
      {block.warning && block.latex && <p className="mt-1 text-xs text-amber-700">Review equation fidelity: {block.warning}</p>}
    </div>;
    if (block.type === 'image') return block.assetUrl ? <StructuredImage key={index} url={block.assetUrl} index={index} /> : <p key={index} className="text-sm text-amber-700">Embedded image was not resolved; review source document.</p>;
    if (block.type === 'table') return <StructuredTable key={index} block={block} compact={compact} />;
    return <div key={index} className="my-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">Embedded object retained for review. {block.warning || ''}</div>;
  });
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

function renderTextWithTablesAndMath(text: string, tables: any[] = [], compact?: boolean) {
  const decoded = decodeHtmlEntities(text);
  const regex = /\[TABLE_(\d+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match;
  
  while ((match = regex.exec(decoded)) !== null) {
    const tableIndex = parseInt(match[1], 10);
    const before = decoded.slice(lastIdx, match.index);
    if (before) {
      parts.push(<span key={`text-${lastIdx}`}>{renderTextWithMath(before, compact)}</span>);
    }
    
    const tableData = tables && tables[tableIndex];
    if (tableData) {
      parts.push(
        <div key={`table-${tableIndex}`} className="my-4 overflow-x-auto w-full border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-850">
              {tableData.rows?.map((row: any, rIdx: number) => {
                const isHeader = rIdx === 0;
                const CellTag = isHeader ? 'th' : 'td';
                return (
                  <tr key={rIdx} className={isHeader ? 'bg-slate-50 dark:bg-slate-800/50' : ''}>
                    {row.map((cell: any, cIdx: number) => {
                      let cellText = '';
                      let cellHtml = '';
                      let colspan = 1;
                      let rowspan = 1;
                      let isBold = isHeader;
                      
                      if (typeof cell === 'object' && cell !== null) {
                        cellText = cell.text || '';
                        cellHtml = cell.html || cell.text || '';
                        if (cell.colspan) colspan = cell.colspan;
                        if (cell.rowspan) rowspan = cell.rowspan;
                        if (cell.bold !== undefined) isBold = cell.bold;
                      } else {
                        cellText = String(cell || '');
                        cellHtml = cellText;
                      }
                      
                      const hasHtml = /<(ul|ol|li|img|p|div|span|br|strong|b|em|i)\b/i.test(cellHtml);

                      return (
                        <CellTag
                          key={cIdx}
                          colSpan={colspan > 1 ? colspan : undefined}
                          rowSpan={rowspan > 1 ? rowspan : undefined}
                          className={`border border-slate-200 dark:border-slate-700 p-2 text-left align-middle ${
                            isBold ? 'font-bold text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {hasHtml ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none text-xs" dangerouslySetInnerHTML={{ __html: resolveHtmlMediaUrls(cellHtml) }} />
                          ) : (
                            renderTextWithMath(cellText, compact)
                          )}
                        </CellTag>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    } else {
      parts.push(<span key={`table-missing-${tableIndex}`} className="text-slate-400"> [Table {tableIndex} missing] </span>);
    }
    lastIdx = regex.lastIndex;
  }
  
  const remaining = decoded.slice(lastIdx);
  if (remaining) {
    parts.push(<span key={`text-remaining-${lastIdx}`}>{renderTextWithMath(remaining, compact)}</span>);
  }
  
  return <div className="space-y-2">{parts}</div>;
}

export function RichContent({
  text,
  latex,
  images = [],
  imageMetadata = [],
  diagrams = [],
  tables = [],
  contentBlocks = [],
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

  // Gather all images already rendered inside tables to avoid displaying them twice
  const getFilename = (url: string) => {
    // Return the full URL to match against orderedImages directly
    return url ?? '';
  };

  const imagesRenderedInTables = new Set<string>();
  if (tables && Array.isArray(tables)) {
    tables.forEach((tableData) => {
      if (tableData && tableData.rows) {
        tableData.rows.forEach((row: any) => {
          if (Array.isArray(row)) {
            row.forEach((cell: any) => {
              const html = typeof cell === 'object' ? cell?.html || '' : String(cell || '');
              const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
              let match;
              while ((match = imgRegex.exec(html)) !== null) {
                imagesRenderedInTables.add(getFilename(match[1]));
              }
              const text = typeof cell === 'object' ? cell?.text || '' : String(cell || '');
              const mdImgRegex = /!\[image\]\(([^)]+)\)/gi;
              let mdMatch;
              while ((mdMatch = mdImgRegex.exec(text)) !== null) {
                imagesRenderedInTables.add(getFilename(mdMatch[1]));
              }
            });
          }
        });
      }
    });
  }

  const filteredImages = orderedImages.filter(url => !imagesRenderedInTables.has(getFilename(url)));

  const primaryText = decodeHtmlEntities(text || '');
  const blockLatex = latex?.trim();
  const hasHtmlMarkup = /<(table|img|p|div|span|br|sup|sub)\b/i.test(primaryText);
  const hasStructuredContent = contentBlocks.length > 0;

  return (
    <MathContentWrapper triggerText={primaryText + blockLatex} className={`rich-content space-y-1.5 min-w-0 ${className}`}>
      {hasStructuredContent ? renderStructuredContent(contentBlocks, compact) : null}
      {!hasStructuredContent && blockLatex && !primaryText.includes('$') ? (
        <MathRenderer latex={blockLatex} display className={compact ? 'text-sm' : undefined} />
      ) : null}
      {!hasStructuredContent && primaryText ? (        <div className={`${compact ? 'text-sm' : 'text-base'} overflow-x-auto prose prose-sm dark:prose-invert max-w-none [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-1`}>
          {hasHtmlMarkup ? (
            <div dangerouslySetInnerHTML={{ __html: resolveHtmlMediaUrls(!/<p\b|<br\s*\/?>/i.test(primaryText) ? primaryText.replace(/\n/g, '<br/>\n') : primaryText) }} />
          ) : (
            renderTextWithTablesAndMath(primaryText, tables, compact)
          )}
        </div>
      ) : null}
      {filteredImages.map((src, i) => (
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
            dangerouslySetInnerHTML={{ __html: resolveHtmlMediaUrls(option) }}
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
            dangerouslySetInnerHTML={{ __html: resolveHtmlMediaUrls(optText) }}
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
        tables={question.rendering_metadata?.tables || (question as any).renderingMetadata?.tables || []}
        contentBlocks={question.content_blocks}
        compact={compact}
      />
      {showOptions && opts.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          {opts.map((opt, idx) => (
            <RichOptionContent
              key={idx}
              option={opt}
              index={idx}
              isCorrect={
                showCorrect && (
                  question.correct_option === idx ||
                  (question.correct_answers && Array.isArray(question.correct_answers) && question.correct_answers.some(ans => {
                    const s = String(ans).trim().toUpperCase();
                    return s === String(idx) || s === String.fromCharCode(65 + idx);
                  }))
                )
              }
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
          <RichContent
            text={question.explanation}
            latex={question.explanation_latex}
            tables={question.rendering_metadata?.tables || (question as any).renderingMetadata?.tables || []}
            compact
          />
        </div>
      )}
    </div>
  );
}

