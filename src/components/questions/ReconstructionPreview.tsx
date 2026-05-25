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
}

export function ReconstructionPreview({
  previewQuestion,
  subtype,
  reconstructing,
  lastResult,
}: ReconstructionPreviewProps) {
  const subtypeLabel = subtype.replace(/_/g, ' ');

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="info" size="sm">
          {previewQuestion.question_type.toUpperCase()}
        </Badge>
        <Badge variant="default" size="sm">
          {subtypeLabel}
        </Badge>
        {reconstructing && (
          <Badge variant="warning" size="sm">
            Reconstructing…
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
        <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc pl-4">
          {lastResult.warnings.slice(0, 3).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className="rounded-md border border-slate-200 dark:border-slate-600 p-2 max-h-[min(70vh,520px)] overflow-y-auto overflow-x-auto">
        <QuestionContentPreview question={previewQuestion} compact showOptions />
      </div>
    </div>
  );
}
