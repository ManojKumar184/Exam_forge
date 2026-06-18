import { Paper } from '../models/Paper.js';
import { AppError } from '../utils/AppError.js';
import { mapPaper } from '../utils/examMapper.js';
import { buildPaperExportHtml } from '../generators/paperExportHtml.js';
import { generatePdfFromHtml } from '../generators/pdfGenerator.js';
import { buildPaperExportDocx } from './paperDocxService.js';
import { createBoundedCache } from '../utils/cacheHelpers.js';

// ── Paper load cache with TTL (30 seconds) — prevents stale data on concurrent edits ──
// Timestamps are stored alongside values to avoid a separate unbounded Map
const paperLoadCache = createBoundedCache(100);
const CACHE_TTL_MS = 30_000;

function getCachedPaper(cacheKey) {
  const entry = paperLoadCache.get(cacheKey);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    paperLoadCache.delete(cacheKey);
    return undefined;
  }
  return entry.data;
}

function setCachedPaper(cacheKey, data) {
  paperLoadCache.set(cacheKey, { data, ts: Date.now() });
}

async function loadPaperForExport(paperId, user) {
  const cacheKey = `${paperId}:${user._id}:${user.role}`;
  const cached = getCachedPaper(cacheKey);
  if (cached !== undefined) return cached;

  const paper = await Paper.findById(paperId)
    // Populate for flat Subject/ExamType removed — collections were dropped
    .populate('createdBy', 'fullName schoolInstitute')
    .populate('questions.questionId');
  if (!paper) throw new AppError('Paper not found', 404, 'NOT_FOUND');
  const creatorId = paper.createdBy?._id?.toString() || paper.createdBy?.toString();
  if (user.role === 'faculty' && creatorId !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  const mapped = mapPaper(paper);
  setCachedPaper(cacheKey, mapped);
  return mapped;
}

function buildExportOpts(paper, paperSet, opts, exportType) {
  return {
    includeAnswers: exportType === 'answer_key' || opts.includeAnswers === true,
    includeExplanations: opts.includeExplanations === true,
    includeQuestionTypeBadges: opts.includeQuestionTypeBadges === true,
    includeDifficulty: opts.includeDifficulty === true,
    includeSource: opts.includeSource === true,
    includeWatermark: opts.includeWatermark === true,
    includeInstituteLogo: opts.includeInstituteLogo !== false,
    showQuestionMarks: opts.showQuestionMarks === true,
    paperSet,
    draftWatermark: paper.status === 'draft',
    publicBaseUrl: opts.publicBaseUrl,
    embedImages: true,
    layout: opts.layout,
    margin: opts.margin,
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize,
    lineSpacing: opts.lineSpacing,
    showInstitutionLogo: opts.showInstitutionLogo,
    institutionLogoUrl: opts.institutionLogoUrl,
    institutionName: opts.institutionName,
    examinationName: opts.examinationName,
    subjectName: opts.subjectName,
    className: opts.className,
    customHeaderText: opts.customHeaderText,
    showPageNumber: opts.showPageNumber,
    footerInstitutionName: opts.footerInstitutionName,
    customFooterText: opts.customFooterText,
    template: opts.template,
    showCoverPage: opts.showCoverPage,
    numberingMode: opts.numberingMode,
    watermarkText: opts.watermarkText,
    watermarkOpacity: opts.watermarkOpacity,
    watermarkSize: opts.watermarkSize,
    watermarkRotation: opts.watermarkRotation,
    exportTypeFormat: opts.exportTypeFormat,
  };
}

/**
 * @param {'paper'|'answer_key'} exportType
 * @param {{ paperSet?: string, allowDraft?: boolean, publicBaseUrl?: string }} opts
 */
export async function exportPaperDocument(paperId, user, exportType, opts = {}) {
  const paper = await loadPaperForExport(paperId, user);
  const paperSet = opts.paperSet || paper.paper_set || 'A';

  if (paper.status === 'draft' && !opts.allowDraft) {
    throw new AppError('Publish the paper or pass allow_draft=true to export drafts', 400, 'DRAFT_EXPORT');
  }

  const showAnswers = exportType === 'answer_key' || opts.includeAnswers === true;
  const html = buildPaperExportHtml(
    { ...paper, paper_set: paperSet },
    buildExportOpts(paper, paperSet, opts, exportType)
  );

  return {
    paper,
    html,
    filename: `${paper.paper_code || paper.id}-${paperSet}-${showAnswers ? 'answer-key' : 'question-paper'}.pdf`,
  };
}

export async function exportPaperPdf(paperId, user, exportType, opts = {}) {
  const { html, filename } = await exportPaperDocument(paperId, user, exportType, opts);
  const buffer = await generatePdfFromHtml(html, opts);
  return { buffer, filename, contentType: 'application/pdf' };
}

export async function exportPaperHtml(paperId, user, exportType, opts = {}) {
  const { html, filename } = await exportPaperDocument(paperId, user, exportType, opts);
  return {
    html,
    filename: filename.replace('.pdf', '.html'),
    contentType: 'text/html; charset=utf-8',
  };
}

/**
 * DOCX-only export — skips HTML generation entirely for better performance.
 */
export async function exportPaperDocx(paperId, user, exportType, opts = {}) {
  const paper = await loadPaperForExport(paperId, user);
  const paperSet = opts.paperSet || paper.paper_set || 'A';

  if (paper.status === 'draft' && !opts.allowDraft) {
    throw new AppError('Publish the paper or pass allow_draft=true to export drafts', 400, 'DRAFT_EXPORT');
  }

  const buffer = await buildPaperExportDocx(
    { ...paper, paper_set: paperSet },
    {
      ...opts,
      paperSet,
      exportTypeFormat: opts.exportTypeFormat || 'paper_with_solutions',
    }
  );

  return {
    buffer,
    filename: `${paper.paper_code || paper.id}-${paperSet}-${exportType}.docx`,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}
