import * as docx from 'docx';
import katex from 'katex';
import { mml2omml } from 'mathml2omml';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { DOMParser } from 'linkedom';
import { normalizeQuestionType as normalizeQT } from '../utils/questionTypeNormalizer.js';
import { decodeHtmlEntities, splitContentParts, groupBySection } from '../utils/exportUtils.js';
import { createBoundedCache } from '../utils/cacheHelpers.js';

// ── Bounded caches for expensive operations (prevents memory leaks) ──
const katexMathmlCache = createBoundedCache(1000);
const imageBufferCache = createBoundedCache(200);
const fontConfigCache = createBoundedCache(50);

function getKatexMathml(latex, displayMode) {
  const key = `${displayMode ? 'd:' : 'i:'}${latex}`;
  if (katexMathmlCache.has(key)) return katexMathmlCache.get(key);
  try {
    const mathml = katex.renderToString(latex, { throwOnError: false, output: 'mathml', displayMode });
    const clean = mathml.match(/<math[\s\S]*?<\/math>/);
    const result = clean ? clean[0] : mathml;
    katexMathmlCache.set(key, result);
    return result;
  } catch {
    katexMathmlCache.set(key, null);
    return null;
  }
}

function getOMML(latex, displayMode) {
  const mathml = getKatexMathml(latex, displayMode);
  if (!mathml) {
    console.warn(`[docx] KaTeX MathML generation failed for: ${latex.slice(0, 80)}`);
    return null;
  }
  try {
    return mml2omml(mathml);
  } catch (e) {
    console.warn(`[docx] OMML conversion failed for: ${latex.slice(0, 80)} — ${e.message}`);
    return null;
  }
}

function getImageBuffer(url) {
  if (!url) return null;
  if (imageBufferCache.has(url)) return imageBufferCache.get(url);
  
  let buffer = null;
  if (url.startsWith('data:image/')) {
    const b64 = url.match(/^data:image\/\w+;base64,(.+)$/);
    if (b64) buffer = Buffer.from(b64[1], 'base64');
  } else {
    const disk = diskPathForUrl(url);
    if (disk) {
      try { buffer = fs.readFileSync(disk); } catch { buffer = null; }
    }
  }
  imageBufferCache.set(url, buffer);
  return buffer;
}

// Disk path resolver
function diskPathForUrl(url) {
  if (!url) return null;
  const rel = url.startsWith('/') ? url.slice(1) : url;
  const disk = path.join(env.uploadDir, rel.replace(/^uploads\/?/, ''));
  return fs.existsSync(disk) ? disk : null;
}

// Convert image paths to docx paragraphs
function createImageParagraphs(imageUrls) {
  const paragraphs = [];
  const uniqueUrls = [...new Set(imageUrls.filter(Boolean))];
  for (const url of uniqueUrls) {
    const buffer = getImageBuffer(url);
    if (buffer) {
      try {
        paragraphs.push(
          new docx.Paragraph({
            alignment: docx.AlignmentType.CENTER,
            keepNext: true,
            children: [
              new docx.ImageRun({
                data: buffer,
                transformation: {
                  width: 300,
                  height: 180,
                },
              }),
            ],
            spacing: { before: 120, after: 120 }
          })
        );
      } catch (e) {
        console.error("Failed to add image run to docx", e);
      }
    }
  }
  return paragraphs;
}

function parseTextToParagraphsAndTables(text) {
  if (!text) return [];
  const regex = /\[TABLE_(\d+)\]/g;
  const elements = [];
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const tableIndex = parseInt(match[1], 10);
    const before = text.slice(lastIdx, match.index);
    if (before.trim()) {
      elements.push({ type: 'text', content: before });
    }
    elements.push({ type: 'table', index: tableIndex });
    lastIdx = regex.lastIndex;
  }
  const remaining = text.slice(lastIdx);
  if (remaining.trim()) {
    elements.push({ type: 'text', content: remaining });
  }
  return elements;
}

function parseHtmlToDocxComponents(html, fontConfig = {}) {
  const fontName = fontConfig.font || 'Times New Roman';
  const fontSizeHalfPt = fontConfig.size ? fontConfig.size * 2 : 22;
  const textRunOpts = { font: fontName, size: fontSizeHalfPt };

  if (!html) return [];

  // Parse HTML
  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(`<html><body>${html}</body></html>`, 'text/html');
  } catch (err) {
    console.error("DOMParser failed in docx export:", err);
    return [
      new docx.Paragraph({
        children: parseTextAndMath(html, null, fontConfig)
      })
    ];
  }

  const body = doc.body;
  const components = [];

  // Process child elements of body
  function processNodes(nodes, paragraphChildren = [], currentStyle = {}) {
    for (const node of nodes) {
      if (node.nodeType === 3) { // TextNode
        const textVal = node.nodeValue || '';
        if (textVal) {
          const parts = splitContentParts(textVal);
          for (const part of parts) {
            if (part.type === 'math') {
              try {
                const omml = getOMML(part.value, part.display);
                if (omml) {
                  const comp = docx.ImportedXmlComponent.fromXmlString(omml);
                  paragraphChildren.push(comp);
                } else {
                  paragraphChildren.push(new docx.TextRun({ text: `$${part.value}$`, ...textRunOpts, ...currentStyle }));
                }
              } catch {
                paragraphChildren.push(new docx.TextRun({ text: `$${part.value}$`, ...textRunOpts, ...currentStyle }));
              }
            } else {
              paragraphChildren.push(new docx.TextRun({ text: part.value, ...textRunOpts, ...currentStyle }));
            }
          }
        }
      } else if (node.nodeType === 1) { // Element
        const tag = node.tagName.toLowerCase();
        if (tag === 'strong' || tag === 'b') {
          processNodes(node.childNodes, paragraphChildren, { ...currentStyle, bold: true });
        } else if (tag === 'em' || tag === 'i') {
          processNodes(node.childNodes, paragraphChildren, { ...currentStyle, italics: true });
        } else if (tag === 'sup') {
          processNodes(node.childNodes, paragraphChildren, { ...currentStyle, superScript: true });
        } else if (tag === 'sub') {
          processNodes(node.childNodes, paragraphChildren, { ...currentStyle, subScript: true });
        } else if (tag === 'span' || tag === 'font') {
          processNodes(node.childNodes, paragraphChildren, currentStyle);
        } else if (tag === 'br') {
          paragraphChildren.push(new docx.TextRun({ break: 1 }));
        } else if (tag === 'img') {
          const src = node.getAttribute('src');
          if (src) {
            const buffer = getImageBuffer(src);
            if (buffer) {
              try {
                paragraphChildren.push(
                  new docx.ImageRun({
                    data: buffer,
                    transformation: {
                      width: 150,
                      height: 90
                    }
                  })
                );
              } catch (e) {
                console.error("Failed to include image inside HTML cell for docx", e);
              }
            }
          }
        } else {
          processNodes(node.childNodes, paragraphChildren, currentStyle);
        }
      }
    }
  }

  const childElements = Array.from(body.childNodes);
  let inlineBuffer = [];

  const flushInlineBuffer = (paragraphOpts = {}) => {
    if (inlineBuffer.length > 0) {
      components.push(
        new docx.Paragraph({
          keepNext: true,
          spacing: { before: 80, after: 80, line: 280 },
          children: inlineBuffer,
          ...paragraphOpts
        })
      );
      inlineBuffer = [];
    }
  };

  for (const node of childElements) {
    if (node.nodeType === 3) {
      processNodes([node], inlineBuffer);
    } else if (node.nodeType === 1) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'p' || tag === 'div') {
        flushInlineBuffer();
        const pChildren = [];
        processNodes(node.childNodes, pChildren);
        if (pChildren.length > 0) {
          components.push(
            new docx.Paragraph({
              keepNext: true,
              spacing: { before: 100, after: 100, line: 280 },
              children: pChildren
            })
          );
        }
      } else if (tag === 'ul' || tag === 'ol') {
        flushInlineBuffer();
        const lis = Array.from(node.querySelectorAll('li'));
        let index = 1;
        for (const li of lis) {
          const liChildren = [];
          processNodes(li.childNodes, liChildren);
          
          if (tag === 'ol') {
            liChildren.unshift(new docx.TextRun({ text: `${index++}.  `, bold: true, ...textRunOpts }));
          }

          components.push(
            new docx.Paragraph({
              bullet: tag === 'ul' ? { level: 0 } : undefined,
              spacing: { before: 60, after: 60, line: 240 },
              indent: { left: 360 },
              children: liChildren
            })
          );
        }
      } else if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
        flushInlineBuffer();
        const hChildren = [];
        processNodes(node.childNodes, hChildren);
        const headingSize = tag === 'h1' ? 32 : tag === 'h2' ? 28 : 24;
        components.push(
          new docx.Paragraph({
            keepNext: true,
            spacing: { before: 200, after: 100 },
            children: hChildren.map(run => {
              if (run instanceof docx.TextRun) {
                run.bold = true;
                run.size = headingSize;
              }
              return run;
            })
          })
        );
      } else {
        processNodes([node], inlineBuffer);
      }
    }
  }

  flushInlineBuffer();

  return components;
}

function renderJsonTableToDocx(tableJson, fontConfig) {
  if (!tableJson || !tableJson.rows || !tableJson.rows.length) {
    return new docx.Table({
      rows: [
        new docx.TableRow({
          children: [
            new docx.TableCell({ children: [new docx.Paragraph("Empty Table")] })
          ]
        })
      ]
    });
  }

  const parsedRows = [];
  for (let rIdx = 0; rIdx < tableJson.rows.length; rIdx++) {
    const row = tableJson.rows[rIdx];
    const isHeader = rIdx === 0;

    const tableCells = row.map((cell) => {
      let cellText = '';
      let cellHtml = '';
      let cellColspan = 1;
      let cellRowspan = 1;
      let cellBold = isHeader;

      if (typeof cell === 'object' && cell !== null) {
        cellText = cell.text || '';
        cellHtml = cell.html || cell.text || '';
        if (cell.colspan) cellColspan = cell.colspan;
        if (cell.rowspan) cellRowspan = cell.rowspan;
        if (cell.bold !== undefined) cellBold = cell.bold;
      } else {
        cellText = String(cell || '');
        cellHtml = cellText;
      }

      let cellChildren = parseHtmlToDocxComponents(cellHtml, fontConfig);
      
      if (cellChildren.length === 0) {
        cellChildren = [new docx.Paragraph({ spacing: { before: 60, after: 60 } })];
      }

      if (cellBold) {
        cellChildren.forEach(p => {
          if (p.children) {
            p.children.forEach(run => {
              if (run instanceof docx.TextRun) {
                run.bold = true;
              }
            });
          }
        });
      }

      if (isHeader) {
        cellChildren.forEach(p => {
          p.alignment = docx.AlignmentType.CENTER;
        });
      }

      return new docx.TableCell({
        columnSpan: cellColspan > 1 ? cellColspan : undefined,
        rowSpan: cellRowspan > 1 ? cellRowspan : undefined,
        shading: isHeader ? { fill: "F1F5F9", type: docx.ShadingType.CLEAR, color: "auto" } : undefined,
        margins: { top: 100, bottom: 100, left: 150, right: 150 },
        children: cellChildren
      });
    });

    parsedRows.push(
      new docx.TableRow({
        cantSplit: true,
        tblHeader: isHeader ? true : undefined,
        children: tableCells
      })
    );
  }

  return new docx.Table({
    borders: {
      top: { style: docx.BorderStyle.SINGLE, size: 8, color: "CBD5E1" },
      bottom: { style: docx.BorderStyle.SINGLE, size: 8, color: "CBD5E1" },
      left: { style: docx.BorderStyle.SINGLE, size: 8, color: "CBD5E1" },
      right: { style: docx.BorderStyle.SINGLE, size: 8, color: "CBD5E1" },
      insideHorizontal: { style: docx.BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
      insideVertical: { style: docx.BorderStyle.SINGLE, size: 4, color: "E2E8F0" }
    },
    width: {
      size: 100,
      type: docx.WidthType.PERCENTAGE
    },
    rows: parsedRows
  });
}

function addTextOrTableToChildren(text, tablesList, container, prefixes = [], fontConfig = {}, lineSpacing = 1.25) {
  const elements = parseTextToParagraphsAndTables(text);
  if (elements.length === 0) {
    const isHtml = /<(ul|ol|p|div|br|strong|b|em|i)\b/i.test(text);
    if (isHtml) {
      const docxParas = parseHtmlToDocxComponents(text, fontConfig);
      if (docxParas.length > 0) {
        docxParas[0].children.unshift(...prefixes);
        container.push(...docxParas);
      } else {
        container.push(
          new docx.Paragraph({
            keepNext: true,
            spacing: { before: 200, after: 120, line: lineSpacing * 240 },
            children: prefixes
          })
        );
      }
    } else {
      const parsedRuns = parseTextAndMath(text || '', null, fontConfig);
      container.push(
        new docx.Paragraph({
          keepNext: true,
          spacing: { before: 200, after: 120, line: lineSpacing * 240 },
          children: [...prefixes, ...parsedRuns]
        })
      );
    }
    return;
  }

  let isFirstText = true;
  for (const el of elements) {
    if (el.type === 'table') {
      try {
        const tableJson = tablesList[el.index];
        const docxTable = renderJsonTableToDocx(tableJson, fontConfig);
        container.push(docxTable);
        container.push(new docx.Paragraph({ spacing: { before: 100, after: 100 } }));
      } catch (err) {
        console.error("Failed to render native JSON table to docx:", err);
      }
    } else {
      const isHtml = /<(ul|ol|p|div|br|strong|b|em|i)\b/i.test(el.content);
      if (isHtml) {
        const docxParas = parseHtmlToDocxComponents(el.content, fontConfig);
        if (isFirstText && docxParas.length > 0) {
          docxParas[0].children.unshift(...prefixes);
          isFirstText = false;
        }
        container.push(...docxParas);
      } else {
        const paragraphs = el.content.split('\n\n').filter(p => p.trim());
        for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
          const pText = paragraphs[pIdx];
          const parsedRuns = parseTextAndMath(pText, null, fontConfig);
          
          const children = [];
          if (isFirstText && pIdx === 0) {
            children.push(...prefixes);
          }
          children.push(...parsedRuns);

          container.push(
            new docx.Paragraph({
              keepNext: true,
              spacing: { before: (isFirstText && pIdx === 0) ? 200 : 100, after: 120, line: lineSpacing * 240 },
              children
            })
          );
        }
        if (paragraphs.length > 0) {
          isFirstText = false;
        }
      }
    }
  }
}

// Parse rich text and math into docx runs/components
function parseTextAndMath(rawText, blockLatex, fontConfig = {}) {
  const children = [];
  const primaryText = decodeHtmlEntities(rawText || '');
  const fontName = fontConfig.font || 'Times New Roman';
  const fontSizeHalfPt = fontConfig.size ? fontConfig.size * 2 : 22; // 11pt = 22 half-pts

  const textRunOpts = {
    font: fontName,
    size: fontSizeHalfPt,
  };

  if (blockLatex && !primaryText.includes('$')) {
    try {
      const omml = getOMML(blockLatex.trim(), true);
      if (omml) {
        const comp = docx.ImportedXmlComponent.fromXmlString(omml);
        children.push(comp);
      } else {
        children.push(new docx.TextRun({ text: blockLatex, ...textRunOpts }));
      }
    } catch (e) {
      children.push(new docx.TextRun({ text: blockLatex, ...textRunOpts }));
    }
  }

  if (primaryText) {
    // Strip simple HTML tags, preserving plain text
    const cleanText = primaryText.replace(/<\/?[^>]+(>|$)/g, "");
    const parts = splitContentParts(cleanText);
    for (const part of parts) {
      if (part.type === 'math') {
        try {
          const omml = getOMML(part.value, part.display);
          if (omml) {
            const comp = docx.ImportedXmlComponent.fromXmlString(omml);
            children.push(comp);
          } else {
            children.push(new docx.TextRun({ text: `$${part.value}$`, ...textRunOpts }));
          }
        } catch {
          children.push(new docx.TextRun({ text: `$${part.value}$`, ...textRunOpts }));
        }
      } else {
        children.push(new docx.TextRun({ text: part.value, ...textRunOpts }));
      }
    }
  }

  return children;
}

// Get option column table
function renderOptionsTable(options, correctOptionIndex, showAnswers, fontConfig) {
  if (!options || options.length === 0) return [];

  const longestOptLength = Math.max(...options.map(opt => (opt.text || '').length));
  let colsCount = 1;
  if (longestOptLength < 15) {
    colsCount = 4;
  } else if (longestOptLength < 35) {
    colsCount = 2;
  }

  const borderlessStyle = {
    top: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: docx.BorderStyle.NONE, size: 0, color: "auto" }
  };

  const textRunOpts = {
    font: fontConfig.font || 'Times New Roman',
    size: fontConfig.size ? fontConfig.size * 2 : 22,
  };

  const cells = options.map((opt, idx) => {
    const label = String.fromCharCode(65 + idx);
    const correctIndicator = showAnswers && correctOptionIndex !== null && Number(correctOptionIndex) === idx ? " ✓" : "";
    const parsedRuns = parseTextAndMath(opt.text, opt.latex, fontConfig);
    
    const labelRun = new docx.TextRun({
      text: `${label}. `,
      bold: true,
      ...textRunOpts
    });

    const childrenRuns = [labelRun, ...parsedRuns];
    if (correctIndicator) {
      childrenRuns.push(
        new docx.TextRun({
          text: correctIndicator,
          bold: true,
          color: "15803D",
          ...textRunOpts
        })
      );
    }

    const optionImageParagraphs = opt.image ? createImageParagraphs([opt.image]) : [];
    const cellParagraphs = [
      new docx.Paragraph({
        keepNext: true,
        children: childrenRuns,
        spacing: { line: fontConfig.lineSpacing * 240, after: 120 }
      }),
      ...optionImageParagraphs
    ];

    return new docx.TableCell({
      borders: borderlessStyle,
      children: cellParagraphs
    });
  });

  const rows = [];
  for (let i = 0; i < cells.length; i += colsCount) {
    const rowCells = cells.slice(i, i + colsCount);
    while (rowCells.length < colsCount) {
      rowCells.push(new docx.TableCell({
        borders: borderlessStyle,
        children: [new docx.Paragraph("")]
      }));
    }
    rows.push(new docx.TableRow({
      cantSplit: true,
      children: rowCells
    }));
  }

  const table = new docx.Table({
    borders: borderlessStyle,
    width: {
      size: 100,
      type: docx.WidthType.PERCENTAGE
    },
    rows: rows
  });

  return [table];
}



// Get answer value helper (canonical-aware)
function getAnswerValue(q) {
  const type = normalizeQT(q.question_type || 'descriptive');
  
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
    return q.answer_text ? q.answer_text.replace(/<\/?[^>]+(>|$)/g, "") : 'Assertion/Reason';
  }
  // DESCRIPTIVE or fallback
  if (q.correct_option !== null && q.correct_option !== undefined && q.correct_option >= 0) {
    return String.fromCharCode(65 + Number(q.correct_option));
  }
  return q.answer_text ? q.answer_text.replace(/<\/?[^>]+(>|$)/g, "") : 'Descriptive';
}

/**
 * Generate complete editable DOCX buffer.
 */
export async function buildPaperExportDocx(paper, options = {}) {
  const exportSettings = paper.export_settings || {};
  
  // Customization fields
  const layout = options.layout || exportSettings.layout || 'single_column';
  const margin = options.margin || exportSettings.margin || 'normal';
  const fontFamily = options.font_family || options.fontFamily || exportSettings.font_family || 'times_new_roman';
  const fontSize = Number(options.font_size || options.fontSize || exportSettings.font_size || 11);
  const lineSpacing = Number(options.line_spacing || options.lineSpacing || exportSettings.line_spacing || 1.25);
  
  const showInstitutionLogo = options.showInstitutionLogo !== undefined ? options.showInstitutionLogo : (exportSettings.show_institution_logo !== undefined ? exportSettings.show_institution_logo : true);
  const institutionName = options.institutionName || exportSettings.institution_name || paper.created_by_profile?.school_institute || 'ExamForge Academy';
  const examinationName = options.examinationName || exportSettings.examination_name || paper.exam_type?.name || 'Examination';
  const subjectName = options.subjectName || exportSettings.subject_name || paper.subject?.name || 'Subject';
  const className = options.className || exportSettings.class_name || String(paper.class || '11');
  const customHeaderText = options.customHeaderText || exportSettings.custom_header_text || '';
  const showPageNumber = options.showPageNumber !== undefined ? options.showPageNumber : (exportSettings.show_page_number !== undefined ? exportSettings.show_page_number : true);
  const footerInstitutionName = options.footerInstitutionName || exportSettings.footer_institution_name || institutionName;
  const customFooterText = options.customFooterText || exportSettings.custom_footer_text || '';
  
  const showCoverPage = options.showCoverPage || exportSettings.show_cover_page || false;
  const numberingMode = options.numberingMode || exportSettings.numbering_mode || 'continuous';
  
  const watermarkText = options.watermarkText || exportSettings.watermark_text || (paper.status === 'draft' ? 'DRAFT' : null);
  
  // Export Format Style
  const exportTypeFormat = options.exportTypeFormat || 'paper_with_solutions';
  
  const showQuestions = exportTypeFormat !== 'answer_key_only' && exportTypeFormat !== 'solutions_only';
  const showAnswersInline = exportTypeFormat === 'paper_with_answers' || exportTypeFormat === 'paper_with_solutions';
  const showFinalAnswerKey = exportTypeFormat === 'paper_with_answers' || exportTypeFormat === 'paper_with_solutions' || exportTypeFormat === 'answer_key_only';
  const showExplanationsSec = exportTypeFormat === 'paper_with_solutions' || exportTypeFormat === 'solutions_only';

  // Margins in Twips (1mm = 56.7 twips)
  let marginTwips = { top: 1247, bottom: 1134, left: 907, right: 907 }; // normal
  if (margin === 'narrow') {
    marginTwips = { top: 850, bottom: 850, left: 567, right: 567 };
  } else if (margin === 'wide') {
    marginTwips = { top: 1700, bottom: 1700, left: 1417, right: 1417 };
  }

  // Mapped Font Configuration
  const fontNameMap = {
    times_new_roman: 'Times New Roman',
    cambria: 'Cambria',
    arial: 'Arial',
    inter: 'Arial' // Arial serves as standard word default fallback for Inter
  };
  const fontName = fontNameMap[fontFamily] || 'Times New Roman';
  const fontConfig = { font: fontName, size: fontSize, lineSpacing };

  const sections = groupBySection(paper);  // imported from exportUtils.js
  const docSections = [];

  // Footer Setup
  const footerChildren = [
    new docx.Paragraph({
      alignment: docx.AlignmentType.LEFT,
      children: [
        new docx.TextRun({ text: footerInstitutionName, bold: true, size: 16, font: fontName, color: "64748B" }),
        new docx.TextRun({ text: customFooterText ? ` | ${customFooterText}` : "", size: 16, font: fontName, color: "64748B" })
      ]
    })
  ];
  if (showPageNumber) {
    footerChildren.push(
      new docx.Paragraph({
        alignment: docx.AlignmentType.RIGHT,
        children: [
          new docx.TextRun({ text: "Page ", size: 16, font: fontName, color: "64748B" }),
          new docx.SimpleField("PAGE"),
          new docx.TextRun({ text: " of ", size: 16, font: fontName, color: "64748B" }),
          new docx.SimpleField("NUMPAGES")
        ]
      })
    );
  }

  const defaultFooter = new docx.Footer({
    children: footerChildren
  });

  // Header Watermark setup
  let defaultHeader = undefined;
  if (watermarkText) {
    defaultHeader = new docx.Header({
      children: [
        new docx.Paragraph({
          alignment: docx.AlignmentType.CENTER,
          children: [
            new docx.TextRun({
              text: watermarkText.toUpperCase(),
              bold: true,
              size: 56,
              color: "E2E8F0",
              font: fontName
            })
          ]
        })
      ]
    });
  }

  // 1. Cover Page Section (if requested)
  if (showCoverPage) {
    const coverPageChildren = [
      new docx.Paragraph({
        alignment: docx.AlignmentType.CENTER,
        spacing: { before: 1400, after: 200 },
        children: [
          new docx.TextRun({ text: institutionName.toUpperCase(), bold: true, size: 40, font: fontName })
        ]
      }),
      new docx.Paragraph({
        alignment: docx.AlignmentType.CENTER,
        spacing: { before: 200, after: 100 },
        children: [
          new docx.TextRun({ text: examinationName, bold: true, size: 28, font: fontName })
        ]
      }),
      new docx.Paragraph({
        alignment: docx.AlignmentType.CENTER,
        spacing: { before: 100, after: 800 },
        children: [
          new docx.TextRun({ text: subjectName, italic: true, size: 24, font: fontName })
        ]
      }),
      new docx.Table({
        width: { size: 80, type: docx.WidthType.PERCENTAGE },
        alignment: docx.AlignmentType.CENTER,
        rows: [
          new docx.TableRow({
            children: [
              new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `Class: Class ${className}`, font: fontName, size: 20 })] })] }),
              new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `Total Questions: ${paper.total_questions}`, font: fontName, size: 20 })] })] })
            ]
          }),
          new docx.TableRow({
            children: [
              new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `Time Allowed: ${paper.duration_minutes} Mins`, font: fontName, size: 20 })] })] }),
              new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `Maximum Marks: ${paper.total_marks} Marks`, font: fontName, size: 20 })] })] })
            ]
          })
        ]
      })
    ];

    if (customHeaderText) {
      coverPageChildren.push(
        new docx.Paragraph({
          alignment: docx.AlignmentType.CENTER,
          spacing: { before: 600 },
          children: [
            new docx.TextRun({ text: customHeaderText, italic: true, size: 20, font: fontName, color: "475569" })
          ]
        })
      );
    }

    docSections.push({
      properties: {
        type: docx.SectionType.NEXT_PAGE,
        page: { margin: marginTwips }
      },
      headers: defaultHeader ? { default: defaultHeader } : undefined,
      footers: { default: defaultFooter },
      children: coverPageChildren
    });
  }

  // 2. Paper Header & General Instructions Section (Single Column)
  const headerSectionChildren = [];
  if (showQuestions) {
    headerSectionChildren.push(
      new docx.Paragraph({
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new docx.TextRun({ text: institutionName, bold: true, size: 32, font: fontName }),
        ]
      }),
      new docx.Paragraph({
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new docx.TextRun({ text: examinationName, bold: true, size: 22, font: fontName }),
        ]
      }),
      new docx.Paragraph({
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new docx.TextRun({ text: paper.title, italic: true, size: 20, font: fontName })
        ]
      })
    );

    // Meta details row
    const borderTopBottom = {
      top: { style: docx.BorderStyle.SINGLE, size: 12, color: "000000" },
      bottom: { style: docx.BorderStyle.SINGLE, size: 12, color: "000000" },
      left: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
      right: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
      insideHorizontal: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
      insideVertical: { style: docx.BorderStyle.NONE, size: 0, color: "auto" }
    };

    headerSectionChildren.push(
      new docx.Table({
        borders: borderTopBottom,
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        rows: [
          new docx.TableRow({
            children: [
              new docx.TableCell({ borders: borderTopBottom, children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `Subject: ${subjectName}`, bold: true, font: fontName, size: 18 })] })] }),
              new docx.TableCell({ borders: borderTopBottom, children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: `Class: Class ${className}`, bold: true, font: fontName, size: 18 })] })] }),
              new docx.TableCell({ borders: borderTopBottom, children: [new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: `Set: ${paper.paperSet}`, bold: true, font: fontName, size: 18 })] })] })
            ]
          }),
          new docx.TableRow({
            children: [
              new docx.TableCell({ borders: borderTopBottom, children: [new docx.Paragraph({ children: [new docx.TextRun({ text: `Time: ${paper.duration_minutes} Mins`, font: fontName, size: 18 })] })] }),
              new docx.TableCell({ borders: borderTopBottom, children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: `Questions: ${paper.total_questions}`, font: fontName, size: 18 })] })] }),
              new docx.TableCell({ borders: borderTopBottom, children: [new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: `Max Marks: ${paper.total_marks}`, bold: true, font: fontName, size: 18 })] })] })
            ]
          })
        ]
      }),
      new docx.Paragraph({ spacing: { before: 200, after: 200 } })
    );

    // General Instructions
    if (paper.instructions) {
      headerSectionChildren.push(
        new docx.Table({
          borders: {
            top: { style: docx.BorderStyle.SINGLE, size: 8, color: "000000" },
            bottom: { style: docx.BorderStyle.SINGLE, size: 8, color: "000000" },
            left: { style: docx.BorderStyle.SINGLE, size: 8, color: "000000" },
            right: { style: docx.BorderStyle.SINGLE, size: 8, color: "000000" }
          },
          width: { size: 100, type: docx.WidthType.PERCENTAGE },
          rows: [
            new docx.TableRow({
              children: [
                new docx.TableCell({
                  children: [
                    new docx.Paragraph({
                      spacing: { before: 120, after: 120 },
                      children: [
                        new docx.TextRun({ text: "General Instructions: ", bold: true, font: fontName, size: 18 }),
                        new docx.TextRun({ text: paper.instructions, font: fontName, size: 18 })
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        }),
        new docx.Paragraph({ spacing: { before: 200, after: 200 } })
      );
    }
  }

  docSections.push({
    properties: {
      type: docx.SectionType.CONTINUOUS,
      page: { margin: marginTwips }
    },
    headers: defaultHeader ? { default: defaultHeader } : undefined,
    footers: { default: defaultFooter },
    children: headerSectionChildren
  });

  // 3. Questions Section (Single or Two Columns)
  const questionSectionChildren = [];
  const allAnswerKeys = [];
  let globalQNum = 0;

  if (showQuestions) {
    for (const sec of sections) {
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

      // Section Header Row
      questionSectionChildren.push(
        new docx.Paragraph({
          alignment: docx.AlignmentType.CENTER,
          keepNext: true,
          spacing: { before: 300, after: 120 },
          children: [
            new docx.TextRun({ text: `SECTION ${sec.key.toUpperCase()}`, bold: true, size: 22, font: fontName }),
          ]
        }),
        new docx.Paragraph({
          alignment: docx.AlignmentType.CENTER,
          keepNext: true,
          spacing: { after: 120 },
          children: [
            new docx.TextRun({ text: sec.title, bold: true, size: 24, font: fontName }),
          ]
        }),
        new docx.Paragraph({
          alignment: docx.AlignmentType.CENTER,
          keepNext: true,
          spacing: { after: 240 },
          children: [
            new docx.TextRun({ text: statsLine, italic: true, size: 18, font: fontName, color: "475569" }),
          ]
        })
      );

      let sectionQNum = 0;
      for (const pq of sec.items) {
        const q = pq.question;
        if (!q) continue;

        globalQNum += 1;
        sectionQNum += 1;
        
        const displayQNum = numberingMode === 'section_wise' ? sectionQNum : globalQNum;
        const keyLabel = numberingMode === 'section_wise' ? `${sec.key}${sectionQNum}` : `Q${globalQNum}`;
        const answerVal = getAnswerValue(q);
        
        allAnswerKeys.push({ qNum: displayQNum, label: keyLabel, answer: answerVal, question: q });

        const marks = pq.custom_marks ?? q.marks ?? 4;
        const showMarksForThisQuestion = !allSameMarks;
        
        const qNumRun = new docx.TextRun({
          text: `Q${displayQNum}. `,
          bold: true,
          font: fontName,
          size: fontSize * 2
        });

        const marksRun = showMarksForThisQuestion ? new docx.TextRun({
          text: ` [${marks} Marks] `,
          bold: true,
          font: fontName,
          size: (fontSize - 1) * 2,
          color: "475569"
        }) : null;

        const prefixes = [qNumRun];
        if (marksRun) prefixes.push(marksRun);

        const tablesList = (q.renderingMetadata?.tables || []).concat(q.imageMetadata?.filter(img => img.type === 'table') || []);
        addTextOrTableToChildren(q.question_text || '', tablesList, questionSectionChildren, prefixes, fontConfig, lineSpacing);

        // Add question images
        const qImages = [
          ...(q.question_images || q.questionImages || []),
          ...(q.image_metadata || q.imageMetadata || []).map(m => m.url)
        ].filter(Boolean);
        if (qImages.length > 0) {
          questionSectionChildren.push(...createImageParagraphs(qImages));
        }

        // Add options table
        if (q.options?.length > 0) {
          questionSectionChildren.push(
            ...renderOptionsTable(q.options, q.correct_option, showAnswersInline, fontConfig)
          );
        }
      }
    }
  } else {
    // Populate keys for answer sheet only modes
    let dummyQNum = 0;
    for (const sec of sections) {
      let dummySecQNum = 0;
      for (const pq of sec.items) {
        const q = pq.question;
        if (!q) continue;
        dummyQNum += 1;
        dummySecQNum += 1;
        const displayQNum = numberingMode === 'section_wise' ? dummySecQNum : dummyQNum;
        const keyLabel = numberingMode === 'section_wise' ? `${sec.key}${dummySecQNum}` : `Q${dummyQNum}`;
        const answerVal = getAnswerValue(q);
        allAnswerKeys.push({ qNum: displayQNum, label: keyLabel, answer: answerVal, question: q });
      }
    }
  }

  docSections.push({
    properties: {
      type: docx.SectionType.CONTINUOUS,
      page: { margin: marginTwips },
      cols: layout === 'two_column' ? { count: 2, space: 720 } : undefined
    },
    headers: defaultHeader ? { default: defaultHeader } : undefined,
    footers: { default: defaultFooter },
    children: questionSectionChildren
  });

  // 4. Answer Key Section (Single Column)
  const answerKeyChildren = [];
  if (showFinalAnswerKey && allAnswerKeys.length > 0) {
    answerKeyChildren.push(
      new docx.Paragraph({
        keepNext: true,
        spacing: { before: 400, after: 200 },
        children: [
          new docx.TextRun({ text: "Answer Key", bold: true, size: 28, font: fontName })
        ]
      })
    );

    // Split answer keys into columns of 10 items
    const columns = [];
    const keysCopy = [...allAnswerKeys];
    while (keysCopy.length > 0) {
      columns.push(keysCopy.splice(0, 10));
    }

    const subTables = columns.map((col) => {
      const subRows = [];
      const textRunOpts = { font: fontName, size: 20 };
      
      // Sub-table Header
      subRows.push(
        new docx.TableRow({
          children: [
            new docx.TableCell({
              shading: { fill: "F1F5F9", type: docx.ShadingType.CLEAR, color: "auto" },
              children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Question", bold: true, ...textRunOpts })] })]
            }),
            new docx.TableCell({
              shading: { fill: "F1F5F9", type: docx.ShadingType.CLEAR, color: "auto" },
              children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: "Answer Key", bold: true, ...textRunOpts })] })]
            })
          ]
        })
      );

      // Sub-table Rows
      for (const k of col) {
        subRows.push(
          new docx.TableRow({
            children: [
              new docx.TableCell({
                children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: k.label, ...textRunOpts })] })]
              }),
              new docx.TableCell({
                children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: k.answer, bold: true, color: "1E3A8A", ...textRunOpts })] })]
              })
            ]
          })
        );
      }

      return new docx.Table({
        borders: {
          top: { style: docx.BorderStyle.SINGLE, size: 8, color: "000000" },
          bottom: { style: docx.BorderStyle.SINGLE, size: 8, color: "000000" },
          left: { style: docx.BorderStyle.SINGLE, size: 8, color: "000000" },
          right: { style: docx.BorderStyle.SINGLE, size: 8, color: "000000" },
          insideHorizontal: { style: docx.BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
          insideVertical: { style: docx.BorderStyle.SINGLE, size: 4, color: "E2E8F0" }
        },
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        rows: subRows
      });
    });

    // Embed sub-tables in a parent borderless grid table
    const borderlessStyle = {
      top: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
      bottom: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
      left: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
      right: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
      insideHorizontal: { style: docx.BorderStyle.NONE, size: 0, color: "auto" },
      insideVertical: { style: docx.BorderStyle.NONE, size: 0, color: "auto" }
    };

    const gridCells = subTables.map(subTable => {
      return new docx.TableCell({
        borders: borderlessStyle,
        children: [subTable, new docx.Paragraph({ spacing: { before: 120 } })]
      });
    });

    const gridRow = new docx.TableRow({
      cantSplit: true,
      children: gridCells
    });

    const masterTable = new docx.Table({
      borders: borderlessStyle,
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      rows: [gridRow]
    });

    answerKeyChildren.push(masterTable);
  }

  docSections.push({
    properties: {
      type: docx.SectionType.CONTINUOUS,
      page: { margin: marginTwips }
    },
    headers: defaultHeader ? { default: defaultHeader } : undefined,
    footers: { default: defaultFooter },
    children: answerKeyChildren
  });

  // 5. Detailed Solutions Section (Single Column)
  const solutionsChildren = [];
  if (showExplanationsSec && allAnswerKeys.length > 0) {
    const listHtml = allAnswerKeys.filter(k => {
      const q = k.question;
      return q.explanation || q.explanation_latex || (q.explanation_images && q.explanation_images.length > 0);
    });

    if (listHtml.length > 0) {
      solutionsChildren.push(
        new docx.Paragraph({
          spacing: { before: 400, after: 200 },
          children: [
            new docx.TextRun({ text: "Detailed Solutions", bold: true, size: 28, font: fontName })
          ]
        })
      );

      for (const k of listHtml) {
        const q = k.question;
        const prefixes = [
          new docx.TextRun({ text: `${k.label}. `, bold: true, font: fontName, size: fontSize * 2 }),
          new docx.TextRun({ text: "Solution:", bold: true, font: fontName, size: fontSize * 2, color: "475569" })
        ];
        const tablesList = q.renderingMetadata?.tables || [];
        addTextOrTableToChildren(q.explanation || 'No step-by-step solution provided.', tablesList, solutionsChildren, prefixes, fontConfig, lineSpacing);

        if (q.explanation_images?.length > 0) {
          solutionsChildren.push(...createImageParagraphs(q.explanation_images));
        }
      }
    }
  }

  docSections.push({
    properties: {
      type: docx.SectionType.CONTINUOUS,
      page: { margin: marginTwips }
    },
    headers: defaultHeader ? { default: defaultHeader } : undefined,
    footers: { default: defaultFooter },
    children: solutionsChildren
  });

  // Assemble document
  const doc = new docx.Document({
    sections: docSections
  });

  return docx.Packer.toBuffer(doc);
}
