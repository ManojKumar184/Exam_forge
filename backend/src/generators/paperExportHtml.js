import katex from 'katex';
import { env } from '../config/env.js';
import path from 'path';
import fs from 'fs';
import { decodeHtmlEntities, splitContentParts, groupBySection, getQuestionTypeLabel } from '../utils/exportUtils.js';
import { normalizeQuestionType } from '../utils/questionTypeNormalizer.js';
import { createBoundedCache } from '../utils/cacheHelpers.js';

// ── Bounded caches for expensive operations (prevents memory leaks) ──
const katexHtmlCache = createBoundedCache(1000);
const imageResolveCache = createBoundedCache(500);

function katexRender(latex, displayMode) {
  const key = `${displayMode ? 'd' : 'i'}:${latex}`;
  if (katexHtmlCache.has(key)) return katexHtmlCache.get(key);
  try {
    const html = katex.renderToString(latex, { throwOnError: false, displayMode });
    katexHtmlCache.set(key, html);
    return html;
  } catch {
    katexHtmlCache.set(key, null);
    return null;
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderRichContent(text, latex) {
  const primaryText = decodeHtmlEntities(text || '');
  const blockLatex = latex?.trim();
  
  let html = '';
  if (blockLatex && !primaryText.includes('$')) {
    html += katexRender(blockLatex, true) || `<pre class="math-error">${escapeHtml(blockLatex)}</pre>`;
  }
  
  if (primaryText) {
    const hasHtmlMarkup = /<(table|img|p|div|span|br|sup|sub|ul|ol|li|strong|b|em|i)\b/i.test(primaryText);
    if (hasHtmlMarkup) {
      // For HTML markup, parse and replace math delimiters inline
      let out = primaryText;
      
      // Replace $$ ... $$
      out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
        return katexRender(decodeHtmlEntities(tex).trim(), true) || tex;
      });
      // Replace \[ ... \]
      out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => {
        return katexRender(decodeHtmlEntities(tex).trim(), true) || tex;
      });
      // Replace $ ... $
      out = out.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
        return katexRender(decodeHtmlEntities(tex).trim(), false) || tex;
      });
      // Replace \( ... \)
      out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => {
        return katexRender(decodeHtmlEntities(tex).trim(), false) || tex;
      });
      
      html += out;
    } else {
      // For plain text, split and render parts
      const parts = splitContentParts(primaryText);
      const renderedParts = parts.map(part => {
        if (part.type === 'math') {
          return katexRender(part.value, part.display) || escapeHtml(part.value);
        }
        return escapeHtml(part.value);
      });
      html += renderedParts.join('');
    }
  }
  return html;
}

function renderJsonTableToHtml(tableJson) {
  if (!tableJson || !tableJson.rows || !tableJson.rows.length) return '';
  const rowsHtml = [];
  for (let rIdx = 0; rIdx < tableJson.rows.length; rIdx++) {
    const row = tableJson.rows[rIdx];
    const isHeader = rIdx === 0;
    const cellTag = isHeader ? 'th' : 'td';
    const cellsHtml = row.map(cell => {
      let cellText = '';
      let cellHtml = '';
      let attrs = '';
      let isBold = isHeader;
      if (typeof cell === 'object' && cell !== null) {
        cellText = cell.text || '';
        cellHtml = cell.html || cell.text || '';
        if (cell.colspan > 1) attrs += ` colspan="${cell.colspan}"`;
        if (cell.rowspan > 1) attrs += ` rowspan="${cell.rowspan}"`;
        if (cell.bold !== undefined) isBold = cell.bold;
      } else {
        cellText = String(cell || '');
        cellHtml = cellText;
      }
      const renderedText = renderRichContent(cellHtml, null);
      const content = isBold ? `<strong>${renderedText}</strong>` : renderedText;
      return `<${cellTag}${attrs}>${content}</${cellTag}>`;
    }).join('');
    rowsHtml.push(`<tr>${cellsHtml}</tr>`);
  }
  return `<table class="publication-table"><tbody>${rowsHtml.join('')}</tbody></table>`;
}

function renderBodyWithTables(text, tables) {
  if (!text) return '';
  const regex = /\[TABLE_(\d+)\]/g;
  let lastIdx = 0;
  let html = '';
  let match;
  while ((match = regex.exec(text)) !== null) {
    const tableIndex = parseInt(match[1], 10);
    const before = text.slice(lastIdx, match.index);
    if (before) {
      html += before.split('\n\n').map(p => {
        if (!p.trim()) return '';
        return `<p>${renderRichContent(p, null)}</p>`;
      }).join('');
    }
    
    if (tables && tables[tableIndex]) {
      html += renderJsonTableToHtml(tables[tableIndex]);
    }
    lastIdx = regex.lastIndex;
  }
  
  const remaining = text.slice(lastIdx);
  if (remaining) {
    html += remaining.split('\n\n').map(p => {
      if (!p.trim()) return '';
      return `<p>${renderRichContent(p, null)}</p>`;
    }).join('');
  }
  return html;
}

// getQuestionTypeLabel imported from exportUtils.js

function resolveImageSrc(url, { publicBaseUrl, embedImages }) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  
  const cacheKey = `${url}|${publicBaseUrl || ''}|${embedImages ? 'embed' : 'url'}`;
  if (imageResolveCache.has(cacheKey)) return imageResolveCache.get(cacheKey);
  
  const rel = url.startsWith('/') ? url.slice(1) : url;
  const disk = path.join(env.uploadDir, rel.replace(/^uploads\/?/, ''));
  
  let result = null;
  if (embedImages && fs.existsSync(disk)) {
    const ext = path.extname(disk).slice(1).toLowerCase() || 'png';
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const buf = fs.readFileSync(disk);
    result = `data:image/${mime};base64,${buf.toString('base64')}`;
  } else if (publicBaseUrl) {
    const base = publicBaseUrl.replace(/\/$/, '');
    result = `${base}${url.startsWith('/') ? url : `/${url}`}`;
  } else if (fs.existsSync(disk)) {
    result = `file://${disk}`;
  }
  
  imageResolveCache.set(cacheKey, result);
  return result;
}

function renderImages(question, exportOpts) {
  const urls = [
    ...(question.question_images || question.questionImages || []),
    ...(question.image_metadata || question.imageMetadata || []).map((m) => m.url),
  ].filter(Boolean);
  const unique = [...new Set(urls)];
  return unique
    .map((src) => {
      const resolved = resolveImageSrc(src, exportOpts);
      if (!resolved) return '';
      return `<figure class="q-figure"><img src="${escapeHtml(resolved)}" alt="Figure"/></figure>`;
    })
    .join('');
}

function renderOptions(options, correctIndex, showAnswers, exportOpts) {
  if (!options?.length) return '';

  // Determine option lengths to decide layout column flow dynamically
  const longestOptLength = Math.max(...options.map(opt => (opt.text || '').length));
  let optionsClass = 'options-1col';
  if (longestOptLength < 15) {
    optionsClass = 'options-4col';
  } else if (longestOptLength < 35) {
    optionsClass = 'options-2col';
  }

  return `<ul class="options ${optionsClass}">${options
    .map((opt, idx) => {
      const label = String.fromCharCode(65 + idx);
      const correct =
        showAnswers && correctIndex !== null && Number(correctIndex) === idx
          ? ' <strong class="correct">✓</strong>'
          : '';
      const img = opt.image ? renderImages({ question_images: [opt.image] }, exportOpts) : '';
      return `<li class="option"><span class="opt-label">${label}.</span> <div class="opt-text">${renderRichContent(
        opt.text,
        opt.latex
      )}${img}${correct}</div></li>`;
    })
    .join('')}</ul>`;
}

function getAnswerValue(q) {
  const type = normalizeQuestionType(q.question_type || 'descriptive');
  
  if (type === 'MCQ_SINGLE' || type === 'MCQ_MULTIPLE') {
    if (type === 'MCQ_MULTIPLE') {
      if (Array.isArray(q.correct_answers) && q.correct_answers.length > 0) {
        return q.correct_answers.map(idx => String.fromCharCode(65 + Number(idx))).join(', ');
      }
    }
    if (q.correct_option !== null && q.correct_option !== undefined && q.correct_option >= 0) {
      return String.fromCharCode(65 + Number(q.correct_option));
    }
  }
  if (type === 'NUMERICAL_INTEGER') {
    if (q.numerical_answer !== null && q.numerical_answer !== undefined) {
      return String(q.numerical_answer);
    }
  }
  if (type === 'MATCH_FOLLOWING') {
    return q.answer_text ? q.answer_text.replace(/<\/?[^>]+(>|$)/g, "") : 'Match the Following';
  }
  if (type === 'ASSERTION_REASON') {
    if (q.correct_option !== null && q.correct_option !== undefined && q.correct_option >= 0) {
      return String.fromCharCode(65 + Number(q.correct_option));
    }
    return q.answer_text ? renderRichContent(q.answer_text) : 'Assertion/Reason';
  }
  // DESCRIPTIVE or fallback
  if (q.correct_option !== null && q.correct_option !== undefined && q.correct_option >= 0) {
    return String.fromCharCode(65 + Number(q.correct_option));
  }
  return q.answer_text ? renderRichContent(q.answer_text) : 'Descriptive';
}

/**
 * Build printable HTML for question paper or answer key.
 */
export function buildPaperExportHtml(paper, options = {}) {
  const exportSettings = paper.export_settings || {};
  const {
    includeAnswers = false,
    includeExplanations = false,
    includeQuestionTypeBadges = false,
    includeDifficulty = false,
    includeSource = false,
    includeWatermark = false,
    includeInstituteLogo = true,
    showQuestionMarks = false,
    paperSet = paper.paper_set || 'A',
    draftWatermark = paper.status === 'draft',
    publicBaseUrl = null,
    embedImages = false,
    // Customization fields
    layout = options.layout || exportSettings.layout || 'single_column',
    margin = options.margin || exportSettings.margin || 'normal',
    fontFamily = options.font_family || options.fontFamily || exportSettings.font_family || 'times_new_roman',
    fontSize = Number(options.font_size || options.fontSize || exportSettings.font_size || 11),
    lineSpacing = Number(options.line_spacing || options.lineSpacing || exportSettings.line_spacing || 1.25),
    showInstitutionLogo = options.showInstitutionLogo !== undefined ? options.showInstitutionLogo : (exportSettings.show_institution_logo !== undefined ? exportSettings.show_institution_logo : includeInstituteLogo),
    institutionName = options.institutionName || exportSettings.institution_name || paper.created_by_profile?.school_institute || 'ExamForge Academy',
    examinationName = options.examinationName || exportSettings.examination_name || paper.exam_type?.name || 'Examination',
    subjectName = options.subjectName || exportSettings.subject_name || paper.subject?.name || 'Subject',
    className = options.className || exportSettings.class_name || String(paper.class || '11'),
    customHeaderText = options.customHeaderText || exportSettings.custom_header_text || '',
    showPageNumber = options.showPageNumber !== undefined ? options.showPageNumber : (exportSettings.show_page_number !== undefined ? exportSettings.show_page_number : true),
    footerInstitutionName = options.footerInstitutionName || exportSettings.footer_institution_name || institutionName,
    customFooterText = options.customFooterText || exportSettings.custom_footer_text || '',
    template = options.template || exportSettings.template || 'default',
    showCoverPage = options.showCoverPage || exportSettings.show_cover_page || false,
    numberingMode = options.numberingMode || exportSettings.numbering_mode || 'continuous',
    watermarkText = options.watermarkText || exportSettings.watermark_text || (includeWatermark ? institutionName : (draftWatermark ? 'DRAFT' : null)),
    watermarkOpacity = Number(options.watermarkOpacity !== undefined ? options.watermarkOpacity : (exportSettings.watermark_opacity !== undefined ? exportSettings.watermark_opacity : 0.04)),
    watermarkSize = Number(options.watermarkSize || exportSettings.watermark_size || 64),
    watermarkRotation = Number(options.watermarkRotation !== undefined ? options.watermarkRotation : (exportSettings.watermark_rotation !== undefined ? exportSettings.watermark_rotation : -25)),
    // Validate exportTypeFormat — unrecognized values fall back to full paper with solutions
    exportTypeFormat = ['paper_only', 'paper_with_answers', 'paper_with_solutions', 'answer_key_only', 'solutions_only'].includes(options.exportTypeFormat)
      ? options.exportTypeFormat
      : 'paper_with_solutions',
    logoUrl = options.logoUrl || exportSettings.logo_url || paper.logo_url || paper.logoUrl || null,
  } = options;

  const exportOpts = { publicBaseUrl, embedImages };
  const resolvedLogoUrl = logoUrl ? resolveImageSrc(logoUrl, exportOpts) : null;

  const showQuestions = exportTypeFormat !== 'answer_key_only' && exportTypeFormat !== 'solutions_only';
  const showAnswersInline = exportTypeFormat === 'paper_with_answers' || exportTypeFormat === 'paper_with_solutions';
  const showFinalAnswerKey = exportTypeFormat === 'paper_with_answers' || exportTypeFormat === 'paper_with_solutions' || exportTypeFormat === 'answer_key_only';
  const showExplanationsSec = exportTypeFormat === 'paper_with_solutions' || exportTypeFormat === 'solutions_only';

  const sections = groupBySection(paper);
  let globalQNum = 0;
  const allAnswerKeys = [];

  const bodySections = showQuestions ? sections
    .map((sec) => {
      const qCount = sec.items.length;
      const totalMarks = sec.items.reduce((sum, item) => sum + (item.custom_marks ?? item.question?.marks ?? 4), 0);
      const marksPerQuestion = qCount > 0 ? (sec.items[0].custom_marks ?? sec.items[0].question?.marks ?? 4) : 4;
      const allSameMarks = sec.items.every(item => (item.custom_marks ?? item.question?.marks ?? 4) === marksPerQuestion);
      
      let statsLine = '';
      if (allSameMarks && qCount > 0) {
        statsLine = `${qCount} Questions × ${marksPerQuestion} Marks = ${totalMarks} Marks`;
      } else {
        statsLine = `${qCount} Questions, Total Marks = ${totalMarks} Marks`;
      }

      let sectionQNum = 0;

      const questionsHtml = sec.items
        .map((pq) => {
          const q = pq.question;
          if (!q) return '';
          
          globalQNum += 1;
          sectionQNum += 1;
          const displayQNum = numberingMode === 'section_wise' ? sectionQNum : globalQNum;
          const keyLabel = numberingMode === 'section_wise' ? `${sec.key}${sectionQNum}` : `Q${globalQNum}`;

          const marks = pq.custom_marks ?? q.marks ?? 4;
          const answerVal = getAnswerValue(q);
          allAnswerKeys.push({ qNum: displayQNum, label: keyLabel, answer: answerVal, question: q });

          const showMarksForThisQuestion = showQuestionMarks || !allSameMarks;
          const marksHtml = showMarksForThisQuestion ? `<span class="q-marks">[${marks}]</span>` : '';

          const badges = [];
          if (includeQuestionTypeBadges) {
            badges.push(`<span class="badge q-type-badge">${getQuestionTypeLabel(q.question_type)}</span>`);
          }
          if (includeDifficulty && q.difficulty) {
            badges.push(`<span class="badge q-difficulty-badge">${q.difficulty.toUpperCase()}</span>`);
          }
          if (includeSource && q.source) {
            badges.push(`<span class="badge q-source-badge">Source: ${escapeHtml(q.source)}</span>`);
          }
          const badgesHtml = badges.length > 0 ? `<div class="q-badges-container">${badges.join('')}</div>` : '';

          return `
          <div class="question-block">
            ${badgesHtml}
            <div class="q-stem-row">
              ${marksHtml}
              <span class="q-num">Q${displayQNum}.</span>
              <span class="q-stem-text">
                ${
                  q.question_latex && !(q.question_text || '').includes('$')
                    ? renderRichContent('', q.question_latex) + renderBodyWithTables(q.question_text || '', q.renderingMetadata?.tables || [])
                    : renderBodyWithTables(q.question_text || '', q.renderingMetadata?.tables || [])
                }
              </span>
            </div>
            ${renderImages(q, exportOpts)}
            ${renderOptions(q.options, q.correct_option, showAnswersInline, exportOpts)}
          </div>`;
        })
        .join('');

      return `
        <section class="paper-section">
          <div class="section-header">
            <div class="section-tag">SECTION ${sec.key.toUpperCase()}</div>
            <div class="section-name">${escapeHtml(sec.title)}</div>
            <div class="section-stats">${statsLine}</div>
          </div>
          ${questionsHtml}
        </section>`;
    })
    .join('') : '';

  // Make sure keys are populated even if questions are not rendered
  if (!showQuestions) {
    let dummyQNum = 0;
    sections.forEach((sec) => {
      let dummySecQNum = 0;
      sec.items.forEach((pq) => {
        const q = pq.question;
        if (!q) return;
        dummyQNum += 1;
        dummySecQNum += 1;
        const displayQNum = numberingMode === 'section_wise' ? dummySecQNum : dummyQNum;
        const keyLabel = numberingMode === 'section_wise' ? `${sec.key}${dummySecQNum}` : `Q${dummyQNum}`;
        const answerVal = getAnswerValue(q);
        allAnswerKeys.push({ qNum: displayQNum, label: keyLabel, answer: answerVal, question: q });
      });
    });
  }

  // Watermark
  const watermark = watermarkText
    ? `<div class="watermark">${escapeHtml(watermarkText)}</div>`
    : '';

  // Roll Number Slot
  let rollNoHtml = '';
  if (exportTypeFormat === 'paper_only' || exportTypeFormat === 'paper_with_answers' || exportTypeFormat === 'paper_with_solutions') {
    rollNoHtml = `
    <div class="roll-number-container">
      <span class="roll-number-label">Roll No.</span>
      <table class="roll-number-table">
        <tr>
          <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>
      </table>
    </div>`;
  }

  // Answer Key
  let answerKeyHtml = '';
  if (showFinalAnswerKey && allAnswerKeys.length > 0) {
    const columns = [];
    const keysCopy = [...allAnswerKeys];
    while (keysCopy.length > 0) {
      columns.push(keysCopy.splice(0, 10));
    }

    const tablesHtml = columns
      .map((col) => {
        const rows = col
          .map(
            (k) => `
          <tr>
            <td style="font-weight: 600; width: 45%; font-family: 'Segoe UI', Arial, sans-serif;">${k.label}</td>
            <td style="font-weight: bold; color: #1e3a8a; width: 55%;">${k.answer}</td>
          </tr>`
          )
          .join('');

        return `
        <table class="answer-key-table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Answer</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>`;
      })
      .join('');

    answerKeyHtml = `
    <section class="answer-key-section page-break-before">
      <h2 class="section-title">Answer Key</h2>
      <div class="answer-key-grid">
        ${tablesHtml}
      </div>
    </section>`;
  }

  // Explanations Section
  let explanationsHtml = '';
  if (showExplanationsSec && allAnswerKeys.length > 0) {
    const listHtml = allAnswerKeys
      .map((k) => {
        const q = k.question;
        if (!q.explanation && !q.explanation_latex && (!q.explanation_images || q.explanation_images.length === 0)) {
          return '';
        }
        
        let expImgHtml = '';
        const urls = [
          ...(q.explanation_images || []),
        ].filter(Boolean);
        if (urls.length > 0) {
          expImgHtml = urls
            .map((src) => {
              const resolved = resolveImageSrc(src, exportOpts);
              if (!resolved) return '';
              return `<figure class="q-figure" style="max-height: 150px;"><img src="${escapeHtml(resolved)}" alt="Explanation Figure" style="max-height: 140px;"/></figure>`;
            })
            .join('');
        }

        return `
        <div class="explanation-block">
          <div class="exp-header">
            <strong>${k.label}.</strong> <span class="exp-badge">Solution</span>
          </div>
          <div class="exp-correct-answer">Correct Answer: <strong>${k.answer}</strong></div>
          <div class="exp-body">
            ${
              q.explanation_latex && !(q.explanation || '').includes('$')
                ? renderRichContent('', q.explanation_latex) + renderBodyWithTables(q.explanation || '', q.renderingMetadata?.tables || [])
                : renderBodyWithTables(q.explanation || 'No step-by-step solution provided.', q.renderingMetadata?.tables || [])
            }
          </div>
          ${expImgHtml}
        </div>`;
      })
      .filter(Boolean)
      .join('');

    if (listHtml) {
      explanationsHtml = `
      <section class="explanations-section page-break-before">
        <h2 class="section-title">Detailed Solutions</h2>
        <div class="explanations-list">
          ${listHtml}
        </div>
      </section>`;
    }
  }

  // Header layout
  let headerHtml = '';
  if (showQuestions) {
    if (showInstitutionLogo) {
      const logoTag = resolvedLogoUrl
        ? `<img class="header-logo" src="${escapeHtml(resolvedLogoUrl)}" alt="Logo" />`
        : `<svg class="header-logo" viewBox="0 0 100 100">
            <path d="M50 10 L85 25 L85 55 C85 75 50 90 50 90 C50 90 15 75 15 55 L15 25 Z" />
            <path d="M30 42 L50 32 L70 42 L50 52 Z" fill="#ffffff" />
            <path d="M50 52 L50 72" stroke="#ffffff" stroke-width="4" />
            <rect x="40" y="68" width="20" height="6" fill="#ffffff" rx="1" />
          </svg>`;
      headerHtml = `
      <div class="header-container">
        ${logoTag}
        <div class="header-text">
          <div class="institution-name">${escapeHtml(institutionName)}</div>
          <div class="exam-name">${escapeHtml(examinationName)}</div>
          <div class="paper-title">${escapeHtml(paper.title)}</div>
        </div>
      </div>`;
    } else {
      headerHtml = `
      <div class="header" style="text-align: center; margin-bottom: 10px;">
        <div class="institution-name">${escapeHtml(institutionName)}</div>
        <div class="exam-name">${escapeHtml(examinationName)}</div>
        <div class="paper-title">${escapeHtml(paper.title)}</div>
      </div>`;
    }
  }

  // Cover Page
  let coverPageHtml = '';
  if (showCoverPage) {
    const logoTag = showInstitutionLogo 
      ? (resolvedLogoUrl
          ? `<img class="cover-logo" src="${escapeHtml(resolvedLogoUrl)}" alt="Logo" style="max-height:72px;max-width:72px;object-fit:contain;margin:0 auto 20px auto;display:block;" />`
          : `<svg viewBox="0 0 100 100" style="width:72px;height:72px;fill:#0f172a;margin:0 auto 20px auto;display:block;">
              <path d="M50 10 L85 25 L85 55 C85 75 50 90 50 90 C50 90 15 75 15 55 L15 25 Z" />
              <path d="M30 42 L50 32 L70 42 L50 52 Z" fill="#ffffff" />
              <path d="M50 52 L50 72" stroke="#ffffff" stroke-width="4" />
              <rect x="40" y="68" width="20" height="6" fill="#ffffff" rx="1" />
            </svg>`)
      : '';

    coverPageHtml = `
    <div class="cover-page">
      <div class="cover-content">
        ${logoTag}
        <h1 class="cover-institution">${escapeHtml(institutionName)}</h1>
        <h2 class="cover-exam">${escapeHtml(examinationName)}</h2>
        <h3 class="cover-subject">${escapeHtml(subjectName)}</h3>
        
        <table class="cover-meta-table">
          <tr>
            <td><strong>Class:</strong> Class ${className}</td>
            <td><strong>Total Questions:</strong> ${paper.total_questions} Questions</td>
          </tr>
          <tr>
            <td><strong>Time Allowed:</strong> ${paper.duration_minutes} Minutes</td>
            <td><strong>Maximum Marks:</strong> ${paper.total_marks} Marks</td>
          </tr>
        </table>
        
        ${customHeaderText ? `<div class="cover-custom-text">${escapeHtml(customHeaderText)}</div>` : ''}
      </div>
    </div>`;
  }

  // Inter Font check
  const fontLoader = fontFamily === 'inter' 
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"/>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(paper.title)} — Set ${paperSet}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"/>
  ${fontLoader}
  <style>
    @page { 
      margin: ${
        margin === 'narrow' ? '15mm 10mm 15mm 10mm' :
        margin === 'wide' ? '30mm 25mm 30mm 25mm' :
        '22mm 16mm 20mm 16mm'
      }; 
    }
    body { 
      font-family: ${
        fontFamily === 'times_new_roman' ? "Georgia, 'Times New Roman', Times, serif" :
        fontFamily === 'cambria' ? "Cambria, Georgia, serif" :
        fontFamily === 'arial' ? "Arial, Helvetica, sans-serif" :
        fontFamily === 'inter' ? "'Inter', 'Segoe UI', sans-serif" :
        "Georgia, 'Times New Roman', Times, serif"
      }; 
      font-size: ${fontSize}pt; 
      color: #000; 
      line-height: ${lineSpacing}; 
    }
    
    .watermark { 
      position: fixed; 
      top: 40%; 
      left: 8%; 
      right: 8%; 
      text-align: center; 
      font-size: ${watermarkSize}pt; 
      font-weight: bold; 
      color: rgba(0,0,0,${watermarkOpacity}); 
      transform: rotate(${watermarkRotation}deg); 
      z-index: 0; 
      pointer-events: none; 
      text-transform: uppercase; 
      word-wrap: break-word; 
      font-family: 'Segoe UI', Arial, sans-serif; 
    }
    
    /* Cover Page Styles */
    .cover-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 82vh;
      text-align: center;
      page-break-after: always;
      break-after: page;
      column-span: all;
      -webkit-column-span: all;
      border: 2px solid #000;
      padding: 30px;
      margin-bottom: 30px;
      box-sizing: border-box;
    }
    .cover-content {
      margin: auto 0;
      width: 100%;
    }
    .cover-institution {
      font-size: 24pt;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 12px;
      font-family: 'Segoe UI', Arial, sans-serif;
      letter-spacing: 0.5px;
    }
    .cover-exam {
      font-size: 16pt;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .cover-subject {
      font-size: 13pt;
      font-style: italic;
      color: #475569;
      margin-bottom: 40px;
    }
    .cover-meta-table {
      width: 80%;
      margin: 0 auto 30px auto;
      border-collapse: collapse;
    }
    .cover-meta-table td {
      border: 1.5px solid #000;
      padding: 10px;
      text-align: left;
      font-size: 10.5pt;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
    .cover-custom-text {
      font-size: 10pt;
      margin-top: 30px;
      color: #475569;
      font-style: italic;
    }

    /* Roll Number table */
    .roll-number-container { float: right; display: flex; align-items: center; margin-bottom: 12px; position: relative; z-index: 10; }
    .roll-number-label { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; font-weight: bold; margin-right: 6px; text-transform: uppercase; color: #475569; }
    .roll-number-table { border-collapse: collapse; margin: 0; width: auto; display: inline-table; }
    .roll-number-table td { border: 1px solid #1e293b; width: 15px; height: 18px; padding: 0; text-align: center; }

    /* Header Styles */
    .header-outer { border-bottom: 4px double #000; padding-bottom: 8px; margin-bottom: 22px; clear: both; column-span: all; -webkit-column-span: all; }
    .header-container { display: flex; align-items: center; justify-content: center; position: relative; z-index: 1; margin-bottom: 8px; }
    .header-logo { width: 56px; height: 56px; fill: #0f172a; margin-right: 18px; flex-shrink: 0; object-fit: contain; }
    .header-text { text-align: center; }
    .institution-name { font-size: 17pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; font-family: 'Segoe UI', Arial, sans-serif; color: #000; }
    .exam-name { font-size: 11.5pt; font-weight: 600; text-transform: uppercase; color: #1e293b; margin-bottom: 4px; font-family: 'Segoe UI', Arial, sans-serif; }
    .paper-title { font-size: 12.5pt; font-style: italic; color: #334155; }
    
    .meta-table { border-collapse: collapse; width: 100%; font-size: 9.5pt; font-family: 'Segoe UI', Arial, sans-serif; border-top: 1.5px solid #000; padding-top: 6px; margin-top: 8px; }
    .meta-table td { border: none; padding: 5px 0; color: #000; }
    
    .instructions { border: 1.5px solid #000; padding: 12px; margin-bottom: 24px; border-radius: 4px; font-size: 9.5pt; font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.5; column-span: all; -webkit-column-span: all; }
    .instructions strong { font-size: 10pt; text-transform: uppercase; }
    
    /* Layout flow control */
    .paper-content {
      column-count: ${layout === 'two_column' ? 2 : 1};
      column-gap: ${layout === 'two_column' ? '16px' : '24px'};
      column-fill: auto;
    }

    /* Section Styles */
    .paper-section { margin-bottom: 30px; }
    .section-header { margin-top: 26px; margin-bottom: 18px; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 8px 0; text-align: center; page-break-after: avoid; break-after: avoid; column-span: all; -webkit-column-span: all; }
    .section-tag { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; font-weight: bold; color: #000; letter-spacing: 1.5px; text-transform: uppercase; }
    .section-name { font-family: Georgia, serif; font-size: 13.5pt; font-weight: bold; color: #000; margin: 4px 0; }
    .section-stats { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #334155; font-style: italic; }
    
    /* Question Block Styles - PRINT LAYOUT OPTIMIZED */
    .question-block { 
      margin: 24px 0; 
      padding-left: 2px; 
      page-break-inside: avoid; 
      break-inside: avoid; 
      display: block; 
    }
    
    .q-badges-container { display: flex; gap: 8px; margin-bottom: 8px; page-break-after: avoid; break-after: avoid; }
    .badge { font-size: 7.5pt; font-weight: 600; text-transform: uppercase; padding: 2px 5px; border-radius: 3px; font-family: 'Segoe UI', Arial, sans-serif; border: 1px solid #1e293b; }
    .q-type-badge { background-color: #f8fafc; color: #0f172a; border-color: #0f172a; }
    .q-difficulty-badge { background-color: #fff1f2; color: #9f1239; border-color: #9f1239; }
    .q-source-badge { background-color: #f0fdf4; color: #166534; border-color: #166534; }

    .q-stem-row { display: flex; align-items: flex-start; margin-bottom: 12px; line-height: 1.6; }
    .q-num { font-weight: bold; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; min-width: 34px; flex-shrink: 0; }
    .q-stem-text { flex-grow: 1; }
    .q-stem-text p, .q-stem-text div { display: inline; margin: 0; padding: 0; }
    .q-marks { float: right; font-weight: bold; margin-left: 14px; color: #000; font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; flex-shrink: 0; }
    
    /* Option Styles (Auto Columns layout) */
    .options { margin: ${layout === 'two_column' ? '6px 0 6px 18px' : '10px 0 10px 34px'}; padding: 0; list-style: none; page-break-inside: avoid; break-inside: avoid; }
    .options-4col { display: flex; flex-wrap: wrap; }
    .options-4col .option { width: 25%; min-width: 120px; box-sizing: border-box; padding-right: 12px; }
    .options-2col { display: flex; flex-wrap: wrap; }
    .options-2col .option { width: 50%; min-width: 240px; box-sizing: border-box; padding-right: 16px; }
    .options-1col .option { width: 100%; }

    .option { margin-bottom: 8px; display: flex; align-items: flex-start; page-break-inside: avoid; break-inside: avoid; }
    .opt-label { font-weight: bold; margin-right: 10px; font-family: 'Segoe UI', Arial, sans-serif; min-width: 22px; flex-shrink: 0; }
    .opt-text { flex-grow: 1; }
    .opt-text p { display: inline; margin: 0; }
    .correct { color: #15803d; font-weight: bold; margin-left: 6px; font-family: sans-serif; }
    
    /* Figure & Image Styles */
    .q-figure { margin: 14px auto; text-align: center; page-break-inside: avoid; break-inside: avoid; display: block; }
    .q-figure img { max-width: 90%; max-height: 330px; height: auto; object-fit: contain; display: block; margin: 0 auto; border: 1.5px solid #000; padding: 6px; border-radius: 4px; }
    
    /* Table Styles */
    table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 10pt; page-break-inside: avoid; break-inside: avoid; }
    table th, table td { border: 1.5px solid #000; padding: 8px 12px; text-align: left; }
    table th { background-color: #f1f5f9; font-weight: bold; color: #000; }

    .publication-table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 9.5pt; page-break-inside: avoid; break-inside: avoid; }
    .publication-table th, .publication-table td { border: 1px solid #1e293b; padding: 6px 10px; text-align: left; vertical-align: middle; }
    .publication-table th { background-color: #f1f5f9; font-weight: bold; color: #000; }
    
    /* Answer Key Styles */
    .answer-key-section { column-span: all; -webkit-column-span: all; }
    .section-title { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14pt; font-weight: bold; margin: 24px 0 12px 0; border-bottom: 2px solid #000; padding-bottom: 4px; }
    .answer-key-grid { display: flex; flex-wrap: wrap; gap: 20px; justify-content: flex-start; margin-top: 18px; page-break-inside: avoid; break-inside: avoid; }
    .answer-key-table { flex: 1 1 180px; max-width: 220px; margin: 0; }
    .answer-key-table th, .answer-key-table td { border: 1.5px solid #000; padding: 6px 10px; text-align: center; font-size: 9.5pt; font-family: 'Segoe UI', Arial, sans-serif; }
    .answer-key-table th { background-color: #f1f5f9; color: #000; }
    
    /* Detailed Solutions Styles */
    .explanations-section { column-span: all; -webkit-column-span: all; }
    .explanations-list { display: flex; flex-direction: column; gap: 22px; margin-top: 18px; }
    .explanation-block { padding: 14px 16px; border-left: 3.5px solid #475569; margin-bottom: 18px; page-break-inside: avoid; break-inside: avoid; background-color: #f8fafc; border-radius: 0 4px 4px 0; border: 1px solid #e2e8f0; border-left: 3.5px solid #475569; }
    .exp-header { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; margin-bottom: 4px; }
    .exp-badge { background-color: #f1f5f9; color: #0f172a; border: 1px solid #0f172a; font-weight: 600; font-size: 7.5pt; padding: 1px 5px; border-radius: 3px; margin-left: 6px; text-transform: uppercase; }
    .exp-correct-answer { font-size: 9.5pt; color: #1e3a8a; margin-bottom: 6px; font-family: 'Segoe UI', Arial, sans-serif; }
    .exp-body { font-size: 10pt; line-height: 1.6; }
    .exp-body p { margin-top: 0; margin-bottom: 8px; }
    .exp-body p:last-child { margin-bottom: 0; }
    
    /* Page Break Helpers */
    .page-break-before { page-break-before: always; break-before: page; }
    .page-break-inside-avoid { page-break-inside: avoid; break-inside: avoid; }

    .katex-display { margin: 0.8em 0; overflow-x: auto; }
    .footer-note { margin-top: 40px; font-size: 8.5pt; color: #475569; text-align: center; border-top: 1.5px solid #000; padding-top: 12px; font-family: 'Segoe UI', Arial, sans-serif; page-break-inside: avoid; break-inside: avoid; text-transform: uppercase; letter-spacing: 0.5px; column-span: all; -webkit-column-span: all; }
  </style>
</head>
<body>
  ${watermark}
  ${coverPageHtml}
  
  ${rollNoHtml}
  
  ${
    showQuestions
      ? `<div class="header-outer">
          ${headerHtml}
          
          <table class="meta-table">
            <tr>
              <td style="width: 33%; font-weight: 500;"><strong>Subject:</strong> ${escapeHtml(subjectName)}</td>
              <td style="width: 34%; text-align: center; font-weight: 500;"><strong>Class:</strong> Class ${className}</td>
              <td style="width: 33%; text-align: right; font-weight: 500;"><strong>Set:</strong> ${paperSet} ${includeAnswers ? '(Answer Key)' : ''}</td>
            </tr>
            <tr>
              <td><strong>Time Allowed:</strong> ${paper.duration_minutes} Mins</td>
              <td style="text-align: center;"><strong>Total Questions:</strong> ${paper.total_questions}</td>
              <td style="text-align: right;"><strong>Max. Marks:</strong> ${paper.total_marks} Marks</td>
            </tr>
          </table>
        </div>`
      : ''
  }
  
  ${showQuestions && paper.instructions ? `<div class="instructions"><strong>Instructions:</strong> ${escapeHtml(paper.instructions)}</div>` : ''}
  
  <div class="paper-content">
    ${bodySections}
  </div>
  
  ${answerKeyHtml}
  
  ${explanationsHtml}
  
  <div class="footer-note">${escapeHtml(footerInstitutionName)} — ${includeAnswers ? 'Faculty use only (Answer Key)' : 'Do not write on this sheet'}</div>
</body>
</html>`;
}

