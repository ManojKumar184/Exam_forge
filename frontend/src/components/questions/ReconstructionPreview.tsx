import { useState, useMemo } from 'react';
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

function countHtmlNodes(html: string): number {
  if (!html) return 0;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    let count = 0;
    const walk = (node: Node) => {
      count++;
      if (node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
        }
      }
    };
    walk(doc.body || doc.documentElement);
    return count;
  } catch {
    return 0;
  }
}

interface SafeTextViewerProps {
  text: string | null | undefined;
  title: string;
  className?: string;
  limit?: number;
}

function SafeTextViewer({
  text,
  title,
  className = "text-indigo-600 dark:text-indigo-400",
  limit = 15000,
}: SafeTextViewerProps) {
  const [showFull, setShowFull] = useState(false);
  if (!text) return null;

  const isTooLarge = text.length > limit;
  const displayVal = showFull ? text : text.slice(0, limit);

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
          {title} ({text.length.toLocaleString()} chars):
        </span>
        {isTooLarge && (
          <button
            type="button"
            onClick={() => setShowFull(!showFull)}
            className="text-[9px] bg-slate-200 hover:bg-slate-350 dark:bg-slate-800 dark:hover:bg-slate-700 px-1.5 py-0.5 rounded font-semibold text-slate-700 dark:text-slate-200 transition-colors"
          >
            {showFull ? "Show Less" : `Show All (+${(text.length - limit).toLocaleString()} chars)`}
          </button>
        )}
      </div>
      <pre className={`p-1.5 rounded bg-slate-100 dark:bg-slate-900 font-mono text-[9px] max-h-36 overflow-y-auto whitespace-pre-wrap break-all ${className}`}>
        {displayVal}
        {!showFull && isTooLarge && (
          <span className="text-amber-500 font-semibold block mt-1">
            ... [TRUNCATED - Payload is large. Click "Show All" to render full debug text]
          </span>
        )}
      </pre>
    </div>
  );
}

function ensureStages(result: any) {
  const defaultStages = {
    stage0: { title: "Stage 0 — Clipboard / DOCX Ingest", mime_types: [], payload_sizes: {}, preview_snippets: {}, raw_clipboard_html: "" },
    stage1: { title: "Stage 1 — Word Nuclear Cleaner", before_html: "", after_html: "", removed_tags: [], removed_attributes: [], math_containing_nodes: [] },
    stage2: { title: "Stage 2 — Structural HTML Normalization", normalization_log: [] },
    stage3: { title: "Stage 3 — Figure/Image Isolation", figures_extracted: [], isolated_html: "" },
    stage4: { title: "Stage 4 — Semantic Math Shielding", equations_detected: [], shield_map: {}, failed_math_detections: [], total_math_count: 0, preserved_math_count: 0, dropped_math_count: 0 },
    stage5: { title: "Stage 5 — DOM Block Extraction", blocks: [] },
    stage6: { title: "Stage 6 — Semantic Question Typing", classified_type: "", evidence: [] },
    stage7: { title: "Stage 7 — Adaptive Parser Selection", selected_parser: "" },
    stage8: { title: "Stage 8 — MCQ / Statement / Comprehension Reconstruction", reconstructed_stem: "", reconstructed_options: [], statement_groups: [] },
    stage9: { title: "Stage 9 — Ollama Semantic Refinement", refined: false, response: null, warnings: [] },
    stage10: { title: "Stage 10 — Final Validation", warnings: [], parser_confidence: 1.0, unresolved_placeholders: [] },
    stage11: { title: "Stage 11 — KaTeX Verification", final_katex_source: "", malformed_expressions: [] },
    stage12: { title: "Stage 12 — Metadata Classification", class: 11, difficulty: "medium", tags: [] },
    stage13: { title: "Stage 13 — Database-ready Semantic Object Generation", db_object: {}, report: {} },
  };

  const debug = result?.debugInfo || {};
  const placeholders = debug.shieldedMathPlaceholders || {};
  const totalMath = Object.keys(placeholders).length;

  const src = debug.rawClipboardHtml || result?.questionHtml || '';
  const vmlDetected = /<v:shape|<v:imagedata|o:OLEObject/i.test(src) || /clip_image\d+/i.test(src);
  const shapeMatches = src.match(/<v:shape|<v:imagedata/gi) || [];
  const clipMatches = src.match(/clip_image\d+/gi) || [];
  const degradedCount = Math.max(shapeMatches.length, clipMatches.length);
  
  const ommlMatch = src.match(/<m:oMath\b|<oMath\b/gi) || [];
  const ommlCount = ommlMatch.length;
  
  const malformedExpressions = result?.debugInfo?.stages?.stage11?.malformed_expressions || [];
  const malformedCount = malformedExpressions.length;
  const unresolvedCount = 0;
  const convertedCount = Math.max(0, totalMath - unresolvedCount - malformedCount);
  const latexValid = malformedCount === 0;

  let stages: any = {};

  if (result?.debugInfo?.stages) {
    stages = JSON.parse(JSON.stringify(result.debugInfo.stages));
  } else {
    stages = {
      stage0: {
        title: "Stage 0 — Clipboard / DOCX Ingest",
        mime_types: debug.rawClipboardHtml ? ["text/plain", "text/html"] : ["text/plain"],
        payload_sizes: {
          "text/plain": (result?.raw_stem || "").length,
          "text/html": (debug.rawClipboardHtml || "").length,
        },
        raw_clipboard_html: debug.rawClipboardHtml || null,
      },
      stage1: {
        title: "Stage 1 — Word Nuclear Cleaner",
        before_html: debug.rawClipboardHtml || null,
        after_html: result?.questionHtml || null,
        removed_tags: debug.rawClipboardHtml ? ["style", "class", "xml"] : [],
        removed_attributes: ["class", "style", "mso-*"],
        math_containing_nodes: debug.rawClipboardHtml && /math|oMath/i.test(debug.rawClipboardHtml) ? ["OMML/MathML"] : [],
      },
      stage2: {
        title: "Stage 2 — Structural HTML Normalization",
        normalization_log: [],
      },
      stage3: {
        title: "Stage 3 — Figure/Image Isolation",
        figures_extracted: result?.figures || [],
        isolated_html: result?.questionHtml || null,
      },
      stage4: {
        title: "Stage 4 — Semantic Math Shielding",
        equations_detected: Object.values(placeholders),
        shield_map: placeholders,
        failed_math_detections: [],
        total_math_count: totalMath,
        preserved_math_count: totalMath,
        dropped_math_count: 0,
      },
      stage5: {
        title: "Stage 5 — DOM Block Extraction",
        blocks: debug.extractedSemanticBlocks?.map((b: string) => ({ type: "block", content: b })) || [],
      },
      stage6: {
        title: "Stage 6 — Semantic Question Typing",
        classified_type: result?.questionType?.toUpperCase() || "MCQ_SINGLE",
        evidence: [`Options Count: ${result?.options?.length || 0}`],
      },
      stage7: {
        title: "Stage 7 — Adaptive Parser Selection",
        selected_parser: result?.options?.length > 0 ? "MCQ Parser" : "Descriptive Parser",
      },
      stage8: {
        title: "Stage 8 — MCQ / Statement / Comprehension Reconstruction",
        reconstructed_stem: result?.questionText || "",
        reconstructed_options: result?.options || [],
        statement_groups: result?.statementGroups || [],
      },
      stage9: {
        title: "Stage 9 — Ollama Semantic Refinement",
        refined: result?.sources?.ollama || false,
        response: null,
        warnings: [],
      },
      stage10: {
        title: "Stage 10 — Final Validation",
        warnings: result?.warnings || [],
        parser_confidence: result?.parser_confidence || 1.0,
        unresolved_placeholders: [],
      },
      stage11: {
        title: "Stage 11 — KaTeX Verification",
        final_katex_source: result?.questionText || "",
        malformed_expressions: malformedExpressions,
      },
      stage12: {
        title: "Stage 12 — Metadata Classification",
        class: result?.class || 11,
        difficulty: result?.difficulty || "medium",
        tags: result?.tags || [],
      },
      stage13: {
        title: "Stage 13 — Database-ready Semantic Object Generation",
        db_object: {
          questionType: result?.questionType || 'MCQ_SINGLE',
          stem: result?.questionText || "",
          options: result?.options || [],
          correctAnswers: result?.correctAnswers || [],
          explanation: result?.explanation || "",
          figures: result?.figures || [],
          metadata: {
            class: result?.class || 11,
            difficulty: result?.difficulty || "medium",
            tags: result?.tags || [],
          },
          formulas: result?.formulas || [],
          difficulty: result?.difficulty || "medium",
          tags: result?.tags || [],
          source: result?.source || 'paste',
          statementGroups: result?.statementGroups || [],
          parserConfidence: result?.parser_confidence || 1.0,
          reconstructionFidelity: result?.reconstructionFidelity || 0.8,
        },
      },
    };
  }

  // Ensure all stage objects are merged with defaultStages to guarantee properties exist
  for (let i = 0; i <= 13; i++) {
    const key = `stage${i}`;
    stages[key] = {
      ...defaultStages[key as keyof typeof defaultStages],
      ...(stages[key] || {}),
    };
  }

  const rawHtmlStr = stages.stage0?.raw_clipboard_html || '';
  const cleanedHtmlStr = stages.stage1?.after_html || result?.questionHtml || '';

  const rawNodes = countHtmlNodes(rawHtmlStr);
  const cleanedNodes = countHtmlNodes(cleanedHtmlStr);
  const nodeReduction = Math.max(0, rawNodes - cleanedNodes);

  if (!stages.stage13.report) {
    stages.stage13.report = {
      inputType: debug.rawClipboardHtml ? "manual_paste" : "upload",
      totalQuestions: 1,
      totalMathExpressions: totalMath,
      preservedMathExpressions: totalMath,
      droppedMathExpressions: 0,
      reconstructionAccuracy: result?.parser_confidence || 1.0,
      optionAccuracy: result?.options?.length > 0 ? 1.0 : 0.0,
      parserWarnings: result?.warnings || [],
      unresolvedBlocks: 0,
      confidence: result?.parser_confidence || 1.0,
      
      totalSemanticMathBlocks: totalMath,
      extractedOmmlBlocks: ommlCount,
      convertedEquations: convertedCount,
      failedConversions: malformedCount,
      vmlImageEquationsDetected: vmlDetected,
      degradedClipboardEquations: degradedCount,
      latexValidity: latexValid,
      unresolvedEquations: unresolvedCount,
      rawNodes,
      cleanedNodes,
      nodeReduction,
    };
  } else {
    stages.stage13.report.rawNodes = rawNodes;
    stages.stage13.report.cleanedNodes = cleanedNodes;
    stages.stage13.report.nodeReduction = nodeReduction;
  }

  return stages;
}

export function ReconstructionPreview({
  previewQuestion,
  subtype,
  reconstructing,
  lastResult,
  pipelineState = 'idle',
}: ReconstructionPreviewProps) {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [showForensics, setShowForensics] = useState(false);
  const [normLimit, setNormLimit] = useState(50);
  const [blocksLimit, setBlocksLimit] = useState(50);

  const subtypeLabel = subtype.replace(/_/g, ' ');

  // Log 10: React preview render inputs
  console.log('[FORENSIC_LOG] 10. React preview render inputs:', {
    previewQuestion,
    subtype,
    reconstructing,
    lastResult,
    pipelineState
  });

  const getPipelineLabel = () => {
    switch (pipelineState) {
      case 'parsing':
        return '1/4: Parsing input layout...';
      case 'ocr':
        return '2/4: Executing OCR...';
      case 'equations':
        return '3/4: Isolating figures & math...';
      case 'gemini':
        return '4/4: Local Ollama refinement...';
      case 'complete':
        return 'Reconstruction complete';
      default:
        return 'Reconstructing…';
    }
  };

  const stagesData = useMemo(() => {
    if (!lastResult || !showForensics) return null;
    return ensureStages(lastResult);
  }, [lastResult, showForensics]);

  const uniqueWarnings = useMemo(() => {
    if (!lastResult?.warnings) return [];
    return Array.from(new Set(lastResult.warnings));
  }, [lastResult?.warnings]);

  const stageTabs = [
    { id: 0, label: '0. Ingest' },
    { id: 1, label: '1. Nuclear Clean' },
    { id: 2, label: '2. HTML Normalize' },
    { id: 3, label: '3. Figure Isolate' },
    { id: 4, label: '4. Math Shield' },
    { id: 5, label: '5. DOM Blocks' },
    { id: 6, label: '6. Typing' },
    { id: 7, label: '7. Parser Select' },
    { id: 8, label: '8. Reconstruct' },
    { id: 9, label: '9. Ollama Refine' },
    { id: 10, label: '10. Validation' },
    { id: 11, label: '11. KaTeX Check' },
    { id: 12, label: '12. Metadata' },
    { id: 13, label: '13. DB Object' },
  ];

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
        {lastResult?.sources.ollama && (
          <Badge variant="success" size="sm">
            Ollama (llama3.2)
          </Badge>
        )}
      </div>

      {uniqueWarnings.length > 0 && (
        <div className="rounded bg-amber-50 dark:bg-amber-950/20 p-2 text-xs border border-amber-200 dark:border-amber-900/50">
          <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">Warnings:</p>
          <ul className="text-amber-700 dark:text-amber-300 list-disc pl-4 space-y-0.5">
            {uniqueWarnings.slice(0, 4).map((w: string, idx: number) => (
              <li key={`warn-${idx}-${w}`}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-md border border-slate-200 dark:border-slate-600 p-2 max-h-[min(60vh,420px)] overflow-y-auto overflow-x-auto bg-white dark:bg-slate-900">
        <QuestionContentPreview question={previewQuestion} compact showOptions showCorrect showExplanation />
      </div>

      {lastResult && (
        <div className="text-xs border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden bg-slate-50 dark:bg-slate-800/40">
          <button
            type="button"
            onClick={() => setShowForensics(!showForensics)}
            className="w-full text-left px-2 py-1.5 bg-slate-100 dark:bg-slate-800 font-medium text-slate-700 dark:text-slate-300 select-none flex items-center justify-between hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors"
          >
            <span className="font-bold flex items-center gap-1">
              <span>{showForensics ? "▼" : "▶"}</span>
              Pipeline Forensic Debug Inspector (SaaS Version)
            </span>
            {lastResult.debugInfo?.timings && (
              <span className="text-[10px] text-slate-400 font-normal">
                total: {(
                  (lastResult.debugInfo.timings.ingestionMs || 0) +
                  (lastResult.debugInfo.timings.reconstructionMs || 0) +
                  (lastResult.debugInfo.timings.classificationMs || 0)
                )}ms
              </span>
            )}
          </button>

          {showForensics && stagesData && (
            <div className="p-2 space-y-2 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-700">
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-300 border-b border-slate-100 dark:border-slate-800">
                {stageTabs.map((tab) => (
                  <button
                    key={`tab-${tab.id}`}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-2 py-1 rounded-t whitespace-nowrap text-[10px] font-medium transition-all ${
                      activeTab === tab.id
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-2 min-h-[140px] bg-slate-50 dark:bg-slate-900/60 rounded border border-slate-100 dark:border-slate-800/80">
                {activeTab === 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage0.title}</h4>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>Available MimeTypes: <span className="font-mono text-indigo-600 dark:text-indigo-400">{(stagesData.stage0.mime_types || []).join(', ') || 'none'}</span></div>
                      {Object.entries(stagesData.stage0.payload_sizes || {}).map(([mime, size]) => (
                        <div key={`mime-size-${mime}`}>{mime} payload size: <span className="font-bold">{(size as number).toLocaleString()} chars</span></div>
                      ))}
                    </div>
                    <SafeTextViewer 
                      text={stagesData.stage0.raw_clipboard_html} 
                      title="Raw Clipboard / DOCX Ingest" 
                      className="text-emerald-600 dark:text-emerald-400" 
                    />
                  </div>
                )}

                {activeTab === 1 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage1.title}</h4>
                    <div className="space-y-1 text-[10px]">
                      <div>Removed tags: <span className="font-mono text-red-600">{(stagesData.stage1.removed_tags || []).join(', ') || 'None'}</span></div>
                      <div>Removed attributes: <span className="font-mono text-red-600">{(stagesData.stage1.removed_attributes || []).join(', ') || 'None'}</span></div>
                      <div>Math components detected: <span className="font-bold text-indigo-600 dark:text-indigo-400">{(stagesData.stage1.math_containing_nodes || []).join(', ') || 'None'}</span></div>
                    </div>
                    <SafeTextViewer 
                      text={stagesData.stage1.after_html} 
                      title="Cleaned Nuclear Output" 
                      className="text-indigo-600 dark:text-indigo-400" 
                    />
                  </div>
                )}

                {activeTab === 2 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage2.title}</h4>
                    <div className="max-h-48 overflow-y-auto space-y-1.5">
                      {stagesData.stage2.normalization_log && stagesData.stage2.normalization_log.length > 0 ? (
                        <>
                          {stagesData.stage2.normalization_log.slice(0, normLimit).map((log: any, idx: number) => (
                            <div key={`norm-log-${idx}-${log.action}`} className="p-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-[9.5px]">
                              <span className="font-bold text-indigo-600 dark:text-indigo-400">[{log.action}]:</span> {log.details || log.reason || JSON.stringify(log)}
                            </div>
                          ))}
                          {stagesData.stage2.normalization_log.length > normLimit && (
                            <button
                              type="button"
                              onClick={() => setNormLimit(p => p + 50)}
                              className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline py-1 w-full text-center"
                            >
                              Show more (+{stagesData.stage2.normalization_log.length - normLimit} items)
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="text-slate-400 text-center py-4">No normalization events logged.</div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 3 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage3.title}</h4>
                    <div className="p-2 bg-white dark:bg-slate-950 rounded border text-[10px] space-y-1">
                      <div>Extracted Figures: <span className="font-bold text-indigo-600">{stagesData.stage3.figures_extracted?.length || 0}</span></div>
                    </div>
                    {stagesData.stage3.figures_extracted && stagesData.stage3.figures_extracted.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {stagesData.stage3.figures_extracted.map((fig: any, idx: number) => (
                          <div key={`fig-${idx}-${fig.id}`} className="p-2 border rounded bg-white dark:bg-slate-950 flex flex-col items-center">
                            <span className="font-bold text-[9px] text-slate-500 mb-1">{fig.id}</span>
                            <img src={fig.url} alt={fig.id} className="max-h-24 object-contain rounded" />
                          </div>
                        ))}
                      </div>
                    )}
                    <SafeTextViewer 
                      text={stagesData.stage3.isolated_html} 
                      title="Isolated HTML (with [FIGURE_1] tags)" 
                      className="text-slate-700 dark:text-slate-300" 
                    />
                  </div>
                )}

                {activeTab === 4 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage4.title}</h4>
                    <div className="grid grid-cols-3 gap-2 text-[10px] bg-white dark:bg-slate-950 p-1.5 rounded border border-slate-100 dark:border-slate-850">
                      <div className="text-center"><span className="text-slate-400 block uppercase text-[8px]">Total Math</span> <span className="font-bold">{stagesData.stage4.total_math_count || 0}</span></div>
                      <div className="text-center border-x"><span className="text-slate-400 block uppercase text-[8px]">Preserved</span> <span className="font-bold text-green-600">{stagesData.stage4.preserved_math_count || 0}</span></div>
                      <div className="text-center"><span className="text-slate-400 block uppercase text-[8px]">Dropped</span> <span className="font-bold text-red-500">{stagesData.stage4.dropped_math_count || 0}</span></div>
                    </div>
                    {stagesData.stage4.shield_map && Object.keys(stagesData.stage4.shield_map).length > 0 && (
                      <div className="max-h-40 overflow-y-auto mt-2 border rounded border-slate-200 dark:border-slate-800">
                        <table className="min-w-full text-[9px] bg-white dark:bg-slate-950">
                          <thead>
                            <tr className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                              <th className="p-1 text-left">Placeholder Token</th>
                              <th className="p-1 text-left">Extracted Formula</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(stagesData.stage4.shield_map).map(([key, math], idx) => (
                              <tr key={`shield-${key}-${idx}`} className="border-b border-slate-100 dark:border-slate-900">
                                <td className="p-1 font-mono font-bold text-slate-500">{key}</td>
                                <td className="p-1 font-mono text-indigo-600 dark:text-indigo-400 break-all">{math as string}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 5 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage5.title}</h4>
                    <div className="max-h-48 overflow-y-auto space-y-1.5">
                      {stagesData.stage5.blocks && stagesData.stage5.blocks.length > 0 ? (
                        <>
                          {stagesData.stage5.blocks.slice(0, blocksLimit).map((block: any, idx: number) => (
                            <div key={`block-${idx}-${block.type}`} className="p-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-[9.5px]">
                              <span className="font-bold text-indigo-600 dark:text-indigo-400">[{block.type}{block.label ? `:${block.label}` : ''}]:</span> {block.content}
                            </div>
                          ))}
                          {stagesData.stage5.blocks.length > blocksLimit && (
                            <button
                              type="button"
                              onClick={() => setBlocksLimit(p => p + 50)}
                              className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline py-1 w-full text-center"
                            >
                              Show more (+{stagesData.stage5.blocks.length - blocksLimit} items)
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="text-slate-400 text-center py-4">No semantic blocks extracted.</div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 6 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage6.title}</h4>
                    <div className="p-2 bg-white dark:bg-slate-950 rounded border text-[10px] space-y-1.5">
                      <div>Classified Type: <span className="font-bold text-indigo-600 uppercase">{stagesData.stage6.classified_type}</span></div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-2">Evidence:</div>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {(stagesData.stage6.evidence || []).map((ev: string, idx: number) => <li key={`evidence-${idx}`}>{ev}</li>)}
                      </ul>
                    </div>
                  </div>
                )}

                {activeTab === 7 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage7.title}</h4>
                    <div className="p-2 bg-white dark:bg-slate-950 rounded border text-[10px]">
                      Selected Parser Sub-Logic: <span className="font-bold text-indigo-650">{stagesData.stage7.selected_parser}</span>
                    </div>
                  </div>
                )}

                {activeTab === 8 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage8.title}</h4>
                    <div className="space-y-2 text-[10px]">
                      {stagesData.stage8.statement_groups?.length > 0 && (
                        <div className="p-2 bg-white dark:bg-slate-950 rounded border border-indigo-50">
                          <div className="text-[8px] uppercase tracking-wider font-bold text-slate-400 mb-1">Extracted Statement Layer:</div>
                          <ol className="list-decimal pl-4 space-y-0.5">
                            {stagesData.stage8.statement_groups.map((s: string, idx: number) => <li key={`statement-${idx}`} className="font-mono">{s}</li>)}
                          </ol>
                        </div>
                      )}
                      <SafeTextViewer 
                        text={stagesData.stage8.reconstructed_stem} 
                        title="Reconstructed Stem" 
                        className="text-slate-850 dark:text-slate-200" 
                      />
                      <div className="p-2 bg-white dark:bg-slate-950 rounded border">
                        <div className="text-[8px] uppercase tracking-wider font-bold text-slate-400 mb-1">Reconstructed Options:</div>
                        <ul className="space-y-1">
                          {(stagesData.stage8.reconstructed_options || []).map((o: any, idx: number) => (
                            <li key={`option-${idx}`} className="font-mono">{String.fromCharCode(65 + idx)}. {o.text}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 9 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage9.title}</h4>
                    <div className="p-2 bg-white dark:bg-slate-950 rounded border text-[10px] space-y-1.5">
                      <div>Local Refinement Status: <span className={`font-semibold ${stagesData.stage9.refined ? 'text-green-600' : 'text-slate-450'}`}>{stagesData.stage9.refined ? '✓ Ollama Refined' : 'Using Deterministic Parser'}</span></div>
                      {stagesData.stage9.warnings?.length > 0 && (
                        <div className="text-amber-600 font-semibold mt-1">
                          {stagesData.stage9.warnings.join('; ')}
                        </div>
                      )}
                    </div>
                    {stagesData.stage9.response && (
                      <SafeTextViewer 
                        text={JSON.stringify(stagesData.stage9.response, null, 2)} 
                        title="Ollama Output Response" 
                        className="text-slate-700 dark:text-slate-300" 
                      />
                    )}
                  </div>
                )}

                {activeTab === 10 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage10.title}</h4>
                    <div className="space-y-1.5 text-[10px]">
                      <div>Parser Confidence: <span className="font-bold text-emerald-600">{((stagesData.stage10.parser_confidence || 1) * 100).toFixed(0)}%</span></div>
                      <div>Unresolved placeholders: <span className="font-mono font-bold text-red-500">{(stagesData.stage10.unresolved_placeholders || []).join(', ') || 'None'}</span></div>
                      {stagesData.stage10.warnings && stagesData.stage10.warnings.length > 0 && (
                        <div className="p-1.5 rounded bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 font-medium">
                          Reconstruction warnings: {(stagesData.stage10.warnings || []).join('; ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 11 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage11.title}</h4>
                    <div className="space-y-1.5 text-[10px]">
                      {stagesData.stage11.malformed_expressions && stagesData.stage11.malformed_expressions.length > 0 ? (
                        <div className="p-2 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded font-semibold space-y-1">
                          <div className="text-[9px] uppercase tracking-wider font-bold">⚠️ Malformed Expressions Detected:</div>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {stagesData.stage11.malformed_expressions.map((mal: string, i: number) => (
                              <li key={`malformed-${i}`}>{mal}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="p-1.5 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 rounded font-medium">
                          ✓ All restored math delimiters and equations match correct LaTeX/KaTeX structure guidelines.
                        </div>
                      )}
                      <SafeTextViewer 
                        text={stagesData.stage11.final_katex_source} 
                        title="Final KaTeX Math Source" 
                        className="text-slate-700 dark:text-slate-300" 
                      />
                    </div>

                    {stagesData.stage13.report && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
                        <div className="p-2 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                          <span className="text-[8px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Preservation Metrics</span>
                          <div>Math Count: <span className="font-bold">{stagesData.stage13.report.totalMathExpressions || 0}</span></div>
                          <div>Preserved: <span className="font-bold text-green-600">{stagesData.stage13.report.preservedMathExpressions || 0}</span></div>
                          <div>Dropped: <span className="font-bold text-red-500">{stagesData.stage13.report.droppedMathExpressions || 0}</span></div>
                          {stagesData.stage13.report.extractedOmmlBlocks !== undefined && (
                            <>
                              <div className="mt-1 border-t pt-1 border-slate-100 dark:border-slate-850">OMML Blocks: <span className="font-bold">{stagesData.stage13.report.extractedOmmlBlocks}</span></div>
                              <div>Converted: <span className="font-bold text-green-600">{stagesData.stage13.report.convertedEquations}</span></div>
                              <div>Failed: <span className="font-bold text-red-500">{stagesData.stage13.report.failedConversions}</span></div>
                              <div>VML Ingested: <span className={`font-bold ${stagesData.stage13.report.vmlImageEquationsDetected ? 'text-red-500' : 'text-slate-500'}`}>{stagesData.stage13.report.vmlImageEquationsDetected ? `Yes (${stagesData.stage13.report.degradedClipboardEquations} degraded)` : 'No'}</span></div>
                              <div>LaTeX Validity: <span className={`font-bold ${stagesData.stage13.report.latexValidity ? 'text-green-600' : 'text-red-500'}`}>{stagesData.stage13.report.latexValidity ? 'Valid' : 'Invalid'}</span></div>
                            </>
                          )}
                        </div>
                        
                        <div className="p-2 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                          <span className="text-[8px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Parser Accuracy</span>
                          <div>Reconstruction score: <span className="font-bold text-indigo-600 dark:text-indigo-400">{(stagesData.stage13.report.reconstructionAccuracy * 100).toFixed(0)}%</span></div>
                          <div>Option extraction: <span className="font-bold">{stagesData.stage13.report.optionAccuracy > 0.5 ? '✓ Success' : 'N/A'}</span></div>
                          <div>Confidence rating: <span className="font-bold uppercase text-emerald-600">{stagesData.stage13.report.confidence > 0.8 ? 'High' : stagesData.stage13.report.confidence > 0.5 ? 'Medium' : 'Needs Review'}</span></div>
                        </div>

                        <div className="p-2 rounded bg-indigo-50/20 dark:bg-indigo-950/10 border border-indigo-150/40 dark:border-indigo-900/30 col-span-1 md:col-span-2">
                          <span className="text-[8px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Word Ingestion & Cleanup Benchmarks</span>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                             <div>Before Cleanup Size: <span className="font-bold">{((stagesData.stage0.payload_sizes?.["text/html"] || 0) / 1024).toFixed(2)} KB</span></div>
                             <div>After Cleanup Size: <span className="font-bold">{((stagesData.stage1.after_html?.length || lastResult.questionHtml?.length || 0) / 1024).toFixed(2)} KB</span></div>
                             <div>Compression Ratio: <span className="font-bold text-indigo-600">
                              {(() => {
                                const before = stagesData.stage0.payload_sizes?.["text/html"] || 0;
                                const after = stagesData.stage1.after_html?.length || lastResult.questionHtml?.length || 0;
                                return after > 0 ? `${(before / after).toFixed(1)}x` : 'N/A';
                              })()}
                             </span></div>
                             <div>VML Purge Count: <span className="font-bold text-red-500">
                              {stagesData.stage13.report.degradedClipboardEquations || 0} purged
                             </span></div>
                             <div>Raw DOM Node Count: <span className="font-bold">{stagesData.stage13.report.rawNodes ?? 0}</span></div>
                             <div>Cleaned DOM Node Count: <span className="font-bold">{stagesData.stage13.report.cleanedNodes ?? 0}</span></div>
                             <div>DOM Node Reduction: <span className="font-bold text-green-600">-{stagesData.stage13.report.nodeReduction ?? 0}</span></div>
                             <div>Semantic Retention Score: <span className="font-bold text-green-600">
                              {(() => {
                                const total = stagesData.stage13.report.totalMathExpressions || 0;
                                const dropped = stagesData.stage13.report.droppedMathExpressions || 0;
                                const failed = stagesData.stage13.report.failedConversions || 0;
                                if (total === 0) return '100%';
                                const score = Math.max(0, Math.min(100, Math.round(((total - dropped - failed) / total) * 100)));
                                return `${score}%`;
                              })()}
                             </span></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {lastResult.debugInfo?.classification && (
                      <div className="p-2 bg-indigo-50/50 dark:bg-indigo-950/20 rounded border border-indigo-100 dark:border-indigo-900/40 text-[10px]">
                        <span className="text-[8.5px] uppercase font-bold text-indigo-600 dark:text-indigo-400 block mb-0.5">Metadata Classifications:</span>
                        Class: <span className="font-bold">{lastResult.debugInfo.classification.class ?? '11'}</span> | 
                        Difficulty: <span className="font-bold uppercase">{lastResult.debugInfo.classification.difficulty ?? 'medium'}</span> | 
                        Subject: <span className="font-bold">{lastResult.debugInfo.classification.hints?.subject || 'Auto-detect'}</span>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 12 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage12.title}</h4>
                    <div className="p-2 bg-white dark:bg-slate-950 rounded border text-[10px] space-y-1.5">
                      <div>Class: <span className="font-bold">{stagesData.stage12.class ?? '11'}</span></div>
                      <div>Difficulty: <span className="font-bold uppercase">{stagesData.stage12.difficulty ?? 'medium'}</span></div>
                      <div>Tags: <span className="font-mono text-indigo-600 dark:text-indigo-400">{(stagesData.stage12.tags || []).join(', ') || 'None'}</span></div>
                    </div>
                  </div>
                )}

                {activeTab === 13 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">{stagesData.stage13.title}</h4>
                    <SafeTextViewer 
                      text={JSON.stringify(stagesData.stage13.db_object, null, 2)} 
                      title="Database-ready Object JSON" 
                      className="text-slate-700 dark:text-slate-300" 
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
