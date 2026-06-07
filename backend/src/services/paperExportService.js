import { Paper } from '../models/Paper.js';
import { AppError } from '../utils/AppError.js';
import { mapPaper } from '../utils/examMapper.js';
import { buildPaperExportHtml } from '../generators/paperExportHtml.js';
import { generatePdfFromHtml } from '../generators/pdfGenerator.js';
import { buildPaperExportDocx } from './paperDocxService.js';

async function loadPaperForExport(paperId, user) {
  const paper = await Paper.findById(paperId)
    .populate('subjectId', 'name code icon color')
    .populate('examTypeId', 'name code description isActive createdAt')
    .populate('createdBy', 'fullName schoolInstitute')
    .populate('questions.questionId');
  if (!paper) throw new AppError('Paper not found', 404, 'NOT_FOUND');
  const creatorId = paper.createdBy?._id?.toString() || paper.createdBy?.toString();
  if (user.role === 'faculty' && creatorId !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return mapPaper(paper);
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
    {
      includeAnswers: showAnswers,
      includeExplanations: opts.includeExplanations === true,
      includeQuestionTypeBadges: opts.includeQuestionTypeBadges === true,
      includeDifficulty: opts.includeDifficulty === true,
      includeSource: opts.includeSource === true,
      includeWatermark: opts.includeWatermark === true,
      includeInstituteLogo: opts.includeInstituteLogo !== false, // default true
      showQuestionMarks: opts.showQuestionMarks === true,
      paperSet,
      draftWatermark: paper.status === 'draft',
      publicBaseUrl: opts.publicBaseUrl,
      embedImages: true,
      // Pass other customization options
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
    }
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
