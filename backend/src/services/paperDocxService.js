import * as docx from 'docx';
import katex from 'katex';
import { mml2omml } from 'mathml2omml';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';

// Decode HTML entities
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

// Split content by LaTeX math delimiters
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

// Disk path resolver
function diskPathForUrl(url) {
  if (!url) return null;
  const rel = url.startsWith('/') ? url.slice(1) : url;
  const disk = path.join(env.uploadDir, rel.replace(/^uploads\/?/, ''));
  return fs.existsSync(disk) ? disk : null;
}

// Base64 or local image buffer resolver
function resolveImageBuffer(url) {
  if (!url) return null;
  if (url.startsWith('data:image/')) {
    const base64Match = url.match(/^data:image\/\w+;base64,(.+)$/);
    if (base64Match) {
      return Buffer.from(base64Match[1], 'base64');
    }
  }
  const disk = diskPathForUrl(url);
  if (disk) {
    try {
      return fs.readFileSync(disk);
    } catch {
      return null;
    }
  }
  return null;
}

// Convert image paths to docx paragraphs
function createImageParagraphs(imageUrls) {
  const paragraphs = [];
  const uniqueUrls = [...new Set(imageUrls.filter(Boolean))];
  for (const url of uniqueUrls) {
    const buffer = resolveImageBuffer(url);
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
      const mathml = katex.renderToString(blockLatex.trim(), { throwOnError: false, output: 'mathml' });
      const cleanMathml = mathml.match(/<math[\s\S]*?<\/math>/)[0];
      const omml = mml2omml(cleanMathml);
      const comp = docx.ImportedXmlComponent.fromXmlString(omml);
      children.push(comp);
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
          const mathml = katex.renderToString(part.value, { throwOnError: false, output: 'mathml' });
          const cleanMathml = mathml.match(/<math[\s\S]*?<\/math>/)[0];
          const omml = mml2omml(cleanMathml);
          const comp = docx.ImportedXmlComponent.fromXmlString(omml);
          children.push(comp);
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

// Group section utility
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

// Get answer value helper
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

  const sections = groupBySection(paper);
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
        
        const parsedRuns = parseTextAndMath(q.question_text, q.question_latex, fontConfig);
        
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

        const childrenRuns = [qNumRun];
        if (marksRun) childrenRuns.push(marksRun);
        childrenRuns.push(...parsedRuns);

        // Add question stem paragraph
        questionSectionChildren.push(
          new docx.Paragraph({
            keepNext: true,
            spacing: { before: 200, after: 120, line: lineSpacing * 240 },
            children: childrenRuns
          })
        );

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

    // Build the grid table
    const tableRows = [];
    const textRunOpts = { font: fontName, size: 20 };
    
    // Add grid header
    tableRows.push(
      new docx.TableRow({
        children: [
          new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Question", bold: true, ...textRunOpts })] })] }),
          new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Answer Key", bold: true, ...textRunOpts })] })] })
        ]
      })
    );

    // Add entries
    for (const k of allAnswerKeys) {
      tableRows.push(
        new docx.TableRow({
          children: [
            new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: k.label, ...textRunOpts })] })] }),
            new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: k.answer, bold: true, color: "1E3A8A", ...textRunOpts })] })] })
          ]
        })
      );
    }

    answerKeyChildren.push(
      new docx.Table({
        width: { size: 50, type: docx.WidthType.PERCENTAGE },
        rows: tableRows
      })
    );
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
        const parsedRuns = parseTextAndMath(q.explanation || 'No step-by-step solution provided.', q.explanation_latex, fontConfig);
        
        solutionsChildren.push(
          new docx.Paragraph({
            keepNext: true,
            spacing: { before: 200, after: 100 },
            children: [
              new docx.TextRun({ text: `${k.label}. `, bold: true, font: fontName, size: fontSize * 2 }),
              new docx.TextRun({ text: "Solution:", bold: true, font: fontName, size: fontSize * 2, color: "475569" })
            ]
          }),
          new docx.Paragraph({
            keepNext: true,
            spacing: { after: 120, line: lineSpacing * 240 },
            children: parsedRuns
          })
        );

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
