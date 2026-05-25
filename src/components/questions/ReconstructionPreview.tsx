import { Badge } from '../ui';
import { QuestionContentPreview } from '../content/RichContent';
import type { Question } from '../../types';
import type { EditorSubtype } from '../../utils/questionPasteDetect';
import type { ReconstructResult } from '../../utils/questionReconstruct';

interface ReconstructionPreviewProps {
  previewQuestion: Question;
  subtype: EditorSubtype;
  reconstructing?: boolean;
  lastResult?: ReconstructResult | null;
  pipelineState?: 'idle' | 'parsing' | 'ocr' | 'equations' | 'gemini' | 'complete';
}

export function ReconstructionPreview({
  previewQuestion,
  subtype,
  reconstructing,
  lastResult,
  pipelineState = 'idle',
}: ReconstructionPreviewProps) {
  const subtypeLabel = subtype.replace(/_/g, ' ');

  const getConfidenceColor = (val: number) => {
    if (val >= 0.85) return 'text-green-600 dark:text-green-400 font-bold';
    if (val >= 0.6) return 'text-amber-600 dark:text-amber-400 font-medium';
    return 'text-red-600 dark:text-red-400 font-medium';
  };

  const getPipelineLabel = () => {
    switch (pipelineState) {
      case 'parsing':
        return '1/4: Parsing input layout...';
      case 'ocr':
        return '2/4: Executing OCR on images...';
      case 'equations':
        return '3/4: Converting equations...';
      case 'gemini':
        return '4/4: Refining with Gemini AI...';
      case 'complete':
        return 'Reconstruction complete';
      default:
        return 'Reconstructing…';
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="info" size="sm">
          {previewQuestion.question_type.toUpperCase()}
        </Badge>
        <Badge variant="default" size="sm">
          {subtypeLabel}
        </Badge>
        {reconstructing && (
          <Badge variant="warning" size="sm" className="animate-pulse">
            {getPipelineLabel()}
          </Badge>
        )}
        {lastResult?.sources.parser && <Badge size="sm">Parser</Badge>}
        {lastResult?.sources.ocr && <Badge size="sm">OCR</Badge>}
        {lastResult?.sources.gemini && (
          <Badge variant="success" size="sm">
            Gemini
          </Badge>
        )}
      </div>

      {lastResult?.warnings && lastResult.warnings.length > 0 && (
        <div className="rounded bg-amber-50 dark:bg-amber-950/20 p-2 text-xs border border-amber-200 dark:border-amber-900/50">
          <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">Warnings:</p>
          <ul className="text-amber-700 dark:text-amber-300 list-disc pl-4 space-y-0.5">
            {lastResult.warnings.slice(0, 4).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-md border border-slate-200 dark:border-slate-600 p-2 max-h-[min(60vh,420px)] overflow-y-auto overflow-x-auto bg-white dark:bg-slate-900">
        <QuestionContentPreview question={previewQuestion} compact showOptions />
      </div>

      {lastResult && (
        <details className="text-xs border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden bg-slate-50 dark:bg-slate-800/40">
          <summary className="cursor-pointer px-2 py-1.5 bg-slate-100 dark:bg-slate-800 font-medium text-slate-700 dark:text-slate-300 select-none">
            Inspection & Pipeline States
          </summary>
          <div className="p-2 space-y-2 divider-y border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400">
              <div>
                Parser Confidence:{' '}
                <span className={getConfidenceColor(lastResult.parser_confidence)}>
                  {(lastResult.parser_confidence * 100).toFixed(0)}%
                </span>
              </div>
              {lastResult.ocr_confidence !== null && (
                <div>
                  OCR Confidence:{' '}
                  <span className={getConfidenceColor(lastResult.ocr_confidence)}>
                    {(lastResult.ocr_confidence * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="font-semibold text-slate-800 dark:text-slate-200">Raw Stem:</p>
              <pre className="p-1 rounded bg-slate-100 dark:bg-slate-900/60 max-h-24 overflow-y-auto font-mono text-[10px] break-all whitespace-pre-wrap">
                {lastResult.raw_stem}
              </pre>
            </div>

            {lastResult.raw_options && lastResult.raw_options.length > 0 && (
              <div className="space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200">Raw Options:</p>
                <ul className="list-decimal pl-4 text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                  {lastResult.raw_options.map((o, idx) => (
                    <li key={idx} className="break-all">
                      {o.text || '[Empty]'}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {lastResult.layout_blocks && lastResult.layout_blocks.length > 0 && (
              <div className="space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  Detected Layout Blocks ({lastResult.layout_blocks.length}):
                </p>
                <div className="max-h-24 overflow-y-auto space-y-1 text-[10px] text-slate-500">
                  {lastResult.layout_blocks.map((b, idx) => (
                    <div key={idx} className="p-1 border border-slate-200 dark:border-slate-700/80 rounded">
                      <span className="font-semibold text-slate-600">Block {idx + 1}: </span>
                      {b.lines.slice(0, 2).join(' ')}
                      {b.lines.length > 2 && '...'}
                      {b.options.length > 0 && ` [Options: ${b.options.length}]`}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
