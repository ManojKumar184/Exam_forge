import katex from 'katex';
import { env } from '../config/env.js';
import path from 'path';
import fs from 'fs';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x2F;/gi, '/');
}

function splitContentParts(raw) {
  if (!raw?.trim()) return [];

  const parts = [];
  let remaining = raw;
  let safety = 0;

  while (remaining.length > 0 && safety < 200) {
    safety += 1;
    const displayMatch = remaining.match(/\$\$([\s\S]+?)\$\$/) || remaining.match(/\\\[([\s\S]+?)\\\]/);
    const inlineMatch = remaining.match(/\$([^$\n]+?)\$/) || remaining.match(/\\\(([\s\S]+?)\\\)/);

    const displayIndex = displayMatch ? remaining.indexOf(displayMatch[0]) : -1;
    const inlineIndex = inlineMatch ? remaining.indexOf(inlineMatch[0]) : -1;

    let useDisplay = false;
    let match = null;

    if (displayIndex >= 0 && (inlineIndex < 0 || displayIndex <= inlineIndex)) {
      useDisplay = true;
      match = displayMatch;
    } else if (inlineIndex >= 0) {
      match = inlineMatch;
    }

    if (!match || match.index === undefined) {
      parts.push({ type: 'text', value: remaining });
      break;
    }

    const matchIndex = remaining.indexOf(match[0]);
    if (matchIndex > 0) {
      parts.push({ type: 'text', value: remaining.slice(0, matchIndex) });
    }

    const latex = match[1] || match[2] || '';
    parts.push({ type: 'math', value: latex.trim(), display: useDisplay });
    remaining = remaining.slice(matchIndex + match[0].length);
  }

  return parts;
}

function renderRichContent(text, latex) {
  const primaryText = decodeHtmlEntities(text || '');
  const blockLatex = latex?.trim();
  
  let html = '';
  if (blockLatex && !primaryText.includes('$')) {
    try {
      html += katex.renderToString(blockLatex, { throwOnError: false, displayMode: true });
    } catch (e) {
      html += `<pre class="math-error">${escapeHtml(blockLatex)}</pre>`;
    }
  }
  
  if (primaryText) {
    const hasHtmlMarkup = /<(table|img|p|div|span|br|sup|sub)\b/i.test(primaryText);
    if (hasHtmlMarkup) {
      // For HTML markup, parse and replace math delimiters inline
      let out = primaryText;
      
      // Replace $$ ... $$
      out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
        try {
          return katex.renderToString(decodeHtmlEntities(tex).trim(), { throwOnError: false, displayMode: true });
        } catch {
          return tex;
        }
      });
      // Replace \[ ... \]
      out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => {
        try {
          return katex.renderToString(decodeHtmlEntities(tex).trim(), { throwOnError: false, displayMode: true });
        } catch {
          return tex;
        }
      });
      // Replace $ ... $
      out = out.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
        try {
          return katex.renderToString(decodeHtmlEntities(tex).trim(), { throwOnError: false, displayMode: false });
        } catch {
          return tex;
        }
      });
      // Replace \( ... \)
      out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => {
        try {
          return katex.renderToString(decodeHtmlEntities(tex).trim(), { throwOnError: false, displayMode: false });
        } catch {
          return tex;
        }
      });
      
      html += out;
    } else {
      // For plain text, split and render parts
      const parts = splitContentParts(primaryText);
      const renderedParts = parts.map(part => {
        if (part.type === 'math') {
          try {
            return katex.renderToString(part.value, { throwOnError: false, displayMode: part.display });
          } catch {
            return escapeHtml(part.value);
          }
        }
        return escapeHtml(part.value);
      });
      html += renderedParts.join('');
    }
  }
  return html;
}

const qTypeMap = {
  mcq: 'MCQ',
  'MCQ_SINGLE': 'MCQ(single)',
  'MCQ_MULTI': 'MCQ(multiple)',
  numerical: 'Numerical',
  'NUMERICAL': 'Numerical',
  'INTEGER': 'Integer',
  descriptive: 'Descriptive',
  'DESCRIPTIVE': 'Descriptive',
  'ASSERTION_REASON': 'Assertion/Reason',
  'MATCH_COLUMNS': 'Match the Following',
  'COMPREHENSION': 'Comprehension',
  'PARAGRAPH_BASED': 'Comprehension',
  'STATEMENT_SET': 'Statement Set',
  'MATRIX_MATCH': 'Matrix Match',
  'TRUE_FALSE': 'True/False',
  'NESTED_OPTION_MCQ': 'MCQ(nested)',
  'CASE_STUDY': 'Case Study'
};

function getQuestionTypeLabel(type) {
  if (!type) return '';
  return qTypeMap[type] || qTypeMap[type.toUpperCase()] || type;
}

function diskPathForUrl(url) {
  if (!url) return null;
  const rel = url.startsWith('/') ? url.slice(1) : url;
  const disk = path.join(env.uploadDir, rel.replace(/^uploads\/?/, ''));
  return fs.existsSync(disk) ? disk : null;
}

function resolveImageSrc(url, { publicBaseUrl, embedImages }) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  const disk = diskPathForUrl(url);
  if (embedImages && disk) {
    const ext = path.extname(disk).slice(1).toLowerCase() || 'png';
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const buf = fs.readFileSync(disk);
    return `data:image/${mime};base64,${buf.toString('base64')}`;
  }
  if (publicBaseUrl) {
    const base = publicBaseUrl.replace(/\/$/, '');
    return `${base}${url.startsWith('/') ? url : `/${url}`}`;
  }
  if (disk) return `file://${disk}`;
  return null;
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
  const type = (q.question_type || 'descriptive').toLowerCase();
  if (type === 'mcq' || type === 'mcq_single' || type === 'nested_option_mcq') {
    if (q.correct_option !== null && q.correct_option !== undefined && q.correct_option >= 0) {
      return String.fromCharCode(65 + Number(q.correct_option));
    }
  }
  if (type === 'mcq_multi' || type === 'msq') {
    if (Array.isArray(q.correct_answers) && q.correct_answers.length > 0) {
      return q.correct_answers.map(idx => String.fromCharCode(65 + Number(idx))).join(', ');
    } else if (q.correct_option !== null && q.correct_option !== undefined && q.correct_option >= 0) {
      return String.fromCharCode(65 + Number(q.correct_option));
    }
  }
  if (type === 'numerical' || type === 'integer') {
    if (q.numerical_answer !== null && q.numerical_answer !== undefined) {
      return String(q.numerical_answer);
    }
  }
  if (q.correct_option !== null && q.correct_option !== undefined && q.correct_option >= 0) {
    return String.fromCharCode(65 + Number(q.correct_option));
  }
  return q.answer_text ? renderRichContent(q.answer_text) : 'Descriptive';
}

function groupBySection(paper) {
  const map = new Map();
  for (const pq of paper.questions || []) {
    const key = pq.section || 'A';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(pq);
  }
  const sectionMeta = new Map((paper.sections || []).map((s) => [s.name, s]));
  return [...map.entries()].map(([sectionKey, items]) => {
    const meta = sectionMeta.get(sectionKey);
    return {
      key: sectionKey,
      title: meta?.name || `Section ${sectionKey}`,
      items: items.sort((a, b) => (a.question_order ?? 0) - (b.question_order ?? 0)),
    };
  });
}

/**
 * Build printable HTML for question paper or answer key.
 */
export function buildPaperExportHtml(paper, options = {}) {
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
  } = options;
  const exportOpts = { publicBaseUrl, embedImages };

  const sections = groupBySection(paper);
  const subjectName = paper.subject?.name || 'Subject';
  const examName = paper.exam_type?.name || 'Exam';
  const institutionName = paper.created_by_profile?.school_institute || 'ExamForge Academy';

  let globalQNum = 0;
  const allAnswerKeys = []; // Array of { qNum, answer }

  const bodySections = sections
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

      const questionsHtml = sec.items
        .map((pq) => {
          const q = pq.question;
          if (!q) return '';
          globalQNum += 1;
          const marks = pq.custom_marks ?? q.marks ?? 4;
          const answerVal = getAnswerValue(q);
          allAnswerKeys.push({ qNum: globalQNum, answer: answerVal, question: q });

          // Smart mark display: hide on uniform sections unless showQuestionMarks is overridden
          const showMarksForThisQuestion = showQuestionMarks || !allSameMarks;
          const marksHtml = showMarksForThisQuestion ? `<span class="q-marks">[${marks}]</span>` : '';

          // Badges
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
              <span class="q-num">Q${globalQNum}.</span>
              <span class="q-stem-text">${renderRichContent(q.question_text, q.question_latex)}</span>
            </div>
            ${renderImages(q, exportOpts)}
            ${renderOptions(q.options, q.correct_option, includeAnswers, exportOpts)}
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
    .join('');

  // Watermark
  const watermarkText = includeWatermark 
    ? (institutionName || 'ExamForge') 
    : (draftWatermark ? 'DRAFT' : '');
  const watermark = watermarkText
    ? `<div class="watermark">${escapeHtml(watermarkText)}</div>`
    : '';

  // Roll Number Slot (rendered for student Question Papers only)
  let rollNoHtml = '';
  if (!includeAnswers) {
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

  // Answer Key Tabular Grid Redesign
  let answerKeyHtml = '';
  if (includeAnswers && allAnswerKeys.length > 0) {
    // Partition answer keys into groups of 10 for multi-column presentation
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
            <td style="font-weight: 600; width: 45%; font-family: 'Segoe UI', Arial, sans-serif;">Q${k.qNum}</td>
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
  if (includeAnswers && includeExplanations && allAnswerKeys.length > 0) {
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
            <strong>Q${k.qNum}.</strong> <span class="exp-badge">Solution</span>
          </div>
          <div class="exp-correct-answer">Correct Answer: <strong>${k.answer}</strong></div>
          <div class="exp-body">
            ${renderRichContent(q.explanation || 'No step-by-step solution provided.', q.explanation_latex)}
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

  // Header layout with conditional logo
  let headerHtml = '';
  if (includeInstituteLogo) {
    headerHtml = `
    <div class="header-container">
      <svg class="header-logo" viewBox="0 0 100 100">
        <path d="M50 10 L85 25 L85 55 C85 75 50 90 50 90 C50 90 15 75 15 55 L15 25 Z" />
        <path d="M30 42 L50 32 L70 42 L50 52 Z" fill="#ffffff" />
        <path d="M50 52 L50 72" stroke="#ffffff" stroke-width="4" />
        <rect x="40" y="68" width="20" height="6" fill="#ffffff" rx="1" />
      </svg>
      <div class="header-text">
        <div class="institution-name">${escapeHtml(institutionName)}</div>
        <div class="exam-name">${escapeHtml(examName)}</div>
        <div class="paper-title">${escapeHtml(paper.title)}</div>
      </div>
    </div>`;
  } else {
    headerHtml = `
    <div class="header" style="text-align: center; margin-bottom: 10px;">
      <div class="institution-name">${escapeHtml(institutionName)}</div>
      <div class="exam-name">${escapeHtml(examName)}</div>
      <div class="paper-title">${escapeHtml(paper.title)}</div>
    </div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(paper.title)} — Set ${paperSet}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"/>
  <style>
    @page { margin: 22mm 16mm 20mm 16mm; }
    body { font-family: Georgia, 'Times New Roman', Times, serif; font-size: 10.5pt; color: #000; line-height: 1.6; }
    .watermark { position: fixed; top: 40%; left: 8%; right: 8%; text-align: center; font-size: 64pt; font-weight: bold; color: rgba(0,0,0,0.04); transform: rotate(-25deg); z-index: 0; pointer-events: none; text-transform: uppercase; word-wrap: break-word; font-family: 'Segoe UI', Arial, sans-serif; }
    
    /* Roll Number table */
    .roll-number-container { float: right; display: flex; align-items: center; margin-bottom: 12px; position: relative; z-index: 10; }
    .roll-number-label { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; font-weight: bold; margin-right: 6px; text-transform: uppercase; color: #475569; }
    .roll-number-table { border-collapse: collapse; margin: 0; width: auto; display: inline-table; }
    .roll-number-table td { border: 1px solid #1e293b; width: 15px; height: 18px; padding: 0; text-align: center; }

    /* Header Styles */
    .header-outer { border-bottom: 4px double #000; padding-bottom: 8px; margin-bottom: 22px; clear: both; }
    .header-container { display: flex; align-items: center; justify-content: center; position: relative; z-index: 1; margin-bottom: 8px; }
    .header-logo { width: 56px; height: 56px; fill: #0f172a; margin-right: 18px; flex-shrink: 0; }
    .header-text { text-align: center; }
    .institution-name { font-size: 17pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; font-family: 'Segoe UI', Arial, sans-serif; color: #000; }
    .exam-name { font-size: 11.5pt; font-weight: 600; text-transform: uppercase; color: #1e293b; margin-bottom: 4px; font-family: 'Segoe UI', Arial, sans-serif; }
    .paper-title { font-size: 12.5pt; font-style: italic; color: #334155; }
    
    .meta-table { border-collapse: collapse; width: 100%; font-size: 9.5pt; font-family: 'Segoe UI', Arial, sans-serif; border-top: 1.5px solid #000; padding-top: 6px; margin-top: 8px; }
    .meta-table td { border: none; padding: 5px 0; color: #000; }
    
    .instructions { border: 1.5px solid #000; padding: 12px; margin-bottom: 24px; border-radius: 4px; font-size: 9.5pt; font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.5; }
    .instructions strong { font-size: 10pt; text-transform: uppercase; }
    
    /* Section Styles */
    .paper-section { margin-bottom: 30px; }
    .section-header { margin-top: 26px; margin-bottom: 18px; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 8px 0; text-align: center; page-break-after: avoid; break-after: avoid; }
    .section-tag { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; font-weight: bold; color: #000; letter-spacing: 1.5px; text-transform: uppercase; }
    .section-name { font-family: Georgia, serif; font-size: 13.5pt; font-weight: bold; color: #000; margin: 4px 0; }
    .section-stats { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #334155; font-style: italic; }
    
    /* Question Block Styles */
    .question-block { margin: 24px 0; padding-left: 2px; page-break-inside: avoid; break-inside: avoid; display: block; }
    
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
    .options { margin: 10px 0 10px 34px; padding: 0; list-style: none; }
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
    
    /* Answer Key Styles */
    .answer-key-grid { display: flex; flex-wrap: wrap; gap: 20px; justify-content: flex-start; margin-top: 18px; }
    .answer-key-table { flex: 1 1 180px; max-width: 220px; margin: 0; }
    .answer-key-table th, .answer-key-table td { border: 1.5px solid #000; padding: 6px 10px; text-align: center; font-size: 9.5pt; font-family: 'Segoe UI', Arial, sans-serif; }
    .answer-key-table th { background-color: #f1f5f9; color: #000; }
    
    /* Detailed Solutions Styles */
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
    .footer-note { margin-top: 40px; font-size: 8.5pt; color: #475569; text-align: center; border-top: 1.5px solid #000; padding-top: 12px; font-family: 'Segoe UI', Arial, sans-serif; page-break-inside: avoid; break-inside: avoid; text-transform: uppercase; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  ${rollNoHtml}
  
  <div class="header-outer">
    ${headerHtml}
    
    <table class="meta-table">
      <tr>
        <td style="width: 33%; font-weight: 500;"><strong>Subject:</strong> ${escapeHtml(subjectName)}</td>
        <td style="width: 34%; text-align: center; font-weight: 500;"><strong>Class:</strong> ${paper.class}</td>
        <td style="width: 33%; text-align: right; font-weight: 500;"><strong>Set:</strong> ${paperSet} ${includeAnswers ? '(Answer Key)' : ''}</td>
      </tr>
      <tr>
        <td><strong>Time Allowed:</strong> ${paper.duration_minutes} Mins</td>
        <td style="text-align: center;"><strong>Total Questions:</strong> ${paper.total_questions}</td>
        <td style="text-align: right;"><strong>Max. Marks:</strong> ${paper.total_marks}</td>
      </tr>
    </table>
  </div>
  
  ${paper.instructions ? `<div class="instructions"><strong>Instructions:</strong> ${escapeHtml(paper.instructions)}</div>` : ''}
  
  ${bodySections}
  
  ${answerKeyHtml}
  
  ${explanationsHtml}
  
  <div class="footer-note">ExamForge — ${includeAnswers ? 'Faculty use only (Answer Key)' : 'Do not write on this sheet'}</div>
</body>
</html>`;
}
