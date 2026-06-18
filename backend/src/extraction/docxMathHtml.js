import { DOMParser } from 'linkedom';

/**
 * LaTeX-first enrichment from mammoth HTML fragments.
 */

function decodeHtmlEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

export function parseHtmlTableToJson(tableEl) {
  const rows = [];
  const trs = tableEl.querySelectorAll('tr');
  for (const tr of trs) {
    const cells = [];
    const tds = tr.querySelectorAll('td, th');
    for (const td of tds) {
      let cellHtml = td.innerHTML || '';
      cellHtml = decodeHtmlEntities(cellHtml).trim();

      let cellText = cellHtml
        .replace(/<sup>([^<]*)<\/sup>/gi, (_, c) => `^{${c.replace(/<[^>]+>/g, '').trim()}}`)
        .replace(/<sub>([^<]*)<\/sub>/gi, (_, c) => `_{${c.replace(/<[^>]+>/g, '').trim()}}`)
        .replace(/<strong>([^<]*)<\/strong>/gi, (_, c) => `\\mathbf{${c.replace(/<[^>]+>/g, '').trim()}}`)
        .replace(/<em>([^<]*)<\/em>/gi, (_, c) => c)
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (_, src) => `![image](${src})`)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      const colspan = td.getAttribute('colspan') ? parseInt(td.getAttribute('colspan'), 10) : 1;
      const rowspan = td.getAttribute('rowspan') ? parseInt(td.getAttribute('rowspan'), 10) : 1;
      
      cells.push({
        text: cellText,
        html: cellHtml,
        colspan,
        rowspan
      });
    }
    if (cells.length) {
      rows.push(cells);
    }
  }
  return { rows };
}

export function htmlToPlainWithLatex(html, collectedTables = []) {
  if (!html) return { text: '', latex: null, displayLatex: null };

  let work = html;
  
  // Parse tables using DOMParser from linkedom
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<html><body>${html}</body></html>`, 'text/html');
    const tables = doc.querySelectorAll('table');
    for (const tableEl of tables) {
      const tableJson = parseHtmlTableToJson(tableEl);
      collectedTables.push(tableJson);
      const placeholder = `[TABLE_${collectedTables.length - 1}]`;
      tableEl.parentNode.replaceChild(doc.createTextNode(` ${placeholder} `), tableEl);
    }
    work = doc.body.innerHTML;
  } catch (err) {
    console.warn("DOM table parsing failed in htmlToPlainWithLatex:", err);
  }

  const displayParts = [];
  const displayRe = /<p[^>]*class="[^"]*equation[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  work = work.replace(displayRe, (_, inner) => {
    displayParts.push(stripInlineHtmlToLatex(inner));
    return `\n$$${displayParts[displayParts.length - 1]}$$\n`;
  });

  work = work
    .replace(/<sup>([^<]*)<\/sup>/gi, (_, c) => `^{${stripInlineHtmlToLatex(c)}}`)
    .replace(/<sub>([^<]*)<\/sub>/gi, (_, c) => `_{${stripInlineHtmlToLatex(c)}}`)
    .replace(/<strong>([^<]*)<\/strong>/gi, (_, c) => `\\mathbf{${stripInlineHtmlToLatex(c)}}`)
    .replace(/<em>([^<]*)<\/em>/gi, (_, c) => c)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '');

  const text = decodeHtmlEntities(work).replace(/\n{3,}/g, '\n\n').trim();
  const displayLatex = displayParts[0] || extractBlockLatex(text);
  const latex = displayLatex || extractPrimaryInlineLatex(text);

  return { text: stripLatexDelimitersForStorage(text), latex, displayLatex };
}

function stripInlineHtmlToLatex(s) {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, '').trim());
}

function stripLatexDelimitersForStorage(text) {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
    .replace(/\$([^$\n]+?)\$/g, '$1')
    .trim();
}

function extractBlockLatex(text) {
  const m = text.match(/\$\$([\s\S]+?)\$\$/);
  return m ? m[1].trim() : null;
}

function extractPrimaryInlineLatex(text) {
  if (/\$\$/.test(text)) return null;
  const m = text.match(/\$([^$\n]+?)\$/);
  return m ? m[1].trim() : null;
}

export function enrichBlockFromHtml(block, html, xmlTables = []) {
  if (!html) return block;
  const collectedTables = [];
  const { text, latex, displayLatex } = htmlToPlainWithLatex(html, collectedTables);
  
  let finalLines = block.lines || [];
  let tableIdx = 0;

  const processTables = (t) => {
    if (!t) return t;
    const tableRegex = /\[TABLE_START\]([\s\S]*?)\[TABLE_END\]/g;
    return t.replace(tableRegex, (_, tableContent) => {
      const currentIdx = tableIdx++;
      const xmlTable = xmlTables && xmlTables[currentIdx];
      
      if (currentIdx >= collectedTables.length) {
        if (xmlTable && xmlTable.tableModel) {
          collectedTables.push(xmlTable.tableModel);
        } else {
          const rows = tableContent.split('\n')
            .map(l => l.trim())
            .filter(l => l && l !== '[TABLE_START]' && l !== '[TABLE_END]')
            .map(line => line.split(' | ').map(cell => cell.trim()));
          collectedTables.push({ rows });
        }
      } else {
        const htmlTable = collectedTables[currentIdx];
        if (htmlTable && xmlTable && xmlTable.tableModel && xmlTable.tableModel.rows) {
          const htmlRows = htmlTable.rows || [];
          const xmlRows = xmlTable.tableModel.rows || [];
          
          for (let r = 0; r < htmlRows.length; r++) {
            const htmlRow = htmlRows[r] || [];
            const xmlRow = xmlRows[r] || [];
            
            for (let c = 0; c < htmlRow.length; c++) {
              const htmlCell = htmlRow[c];
              const xmlCell = xmlRow[c];
              
              if (htmlCell !== undefined && xmlCell !== undefined) {
                const xmlText = typeof xmlCell === 'object' ? xmlCell.text : xmlCell;
                if (xmlText) {
                  const htmlText = typeof htmlCell === 'object' ? htmlCell.text : htmlCell;
                  const hasImage = htmlText && htmlText.includes('![image]');
                  let mergedText = xmlText;
                  if (hasImage) {
                    const imgRegex = /!\[image\]\([^)]+\)/g;
                    const images = htmlText.match(imgRegex);
                    if (images) {
                      mergedText += ' ' + images.join(' ');
                    }
                  }
                  if (typeof htmlCell === 'object') {
                    htmlCell.text = mergedText;
                    if (xmlCell && xmlCell.html) {
                      htmlCell.html = xmlCell.html;
                      if (htmlText && htmlText.includes('![image]')) {
                        const imgTags = htmlCell.html.match(/<img[^>]+>/g) || [];
                        if (imgTags.length > 0) {
                          htmlCell.html += ' ' + imgTags.join(' ');
                        }
                      }
                    } else if (xmlText.includes('$') && htmlCell.html && !htmlCell.html.includes('$')) {
                      htmlCell.html = htmlCell.html.replace(htmlText, xmlText);
                    }
                  } else {
                    htmlRow[c] = {
                      text: mergedText,
                      html: (xmlCell && xmlCell.html) || mergedText,
                      colspan: 1,
                      rowspan: 1
                    };
                  }
                }
              }
            }
          }
        }
      }
      return `[TABLE_${currentIdx}]`;
    });
  };

  // Replace table markers in stem lines
  let stemText = finalLines.join('\n');
  stemText = processTables(stemText);
  finalLines = stemText.split('\n');

  // Replace in options
  let finalOptions = block.options;
  if (finalOptions && finalOptions.length > 0) {
    finalOptions = finalOptions.map(opt => {
      if (opt.text) {
        return {
          ...opt,
          text: processTables(opt.text)
        };
      }
      return opt;
    });
  }

  // Replace in explanation
  let finalExplanation = block.explanation;
  if (finalExplanation) {
    finalExplanation = processTables(finalExplanation);
  }

  const questionLatex = displayLatex || latex || block.questionLatex || null;
  const mergedText = finalLines.length ? finalLines.join('\n') : text;
  const finalText = mergedText || text;

  const tableImages = [];
  for (const table of collectedTables) {
    if (table && table.rows) {
      for (const row of table.rows) {
        for (const cell of row) {
          const cellText = typeof cell === 'object' ? cell.text : cell;
          if (cellText && cellText.includes('![image]')) {
            const imgRegex = /!\[image\]\(([^)]+)\)/g;
            let m;
            while ((m = imgRegex.exec(cellText)) !== null) {
              tableImages.push(m[1]);
            }
          }
        }
      }
    }
  }

  const finalImages = [...(block.images || [])];
  for (const img of tableImages) {
    if (!finalImages.includes(img)) {
      finalImages.push(img);
    }
  }

  return {
    ...block,
    lines: finalText.split('\n').filter(Boolean),
    options: finalOptions || block.options,
    explanation: finalExplanation || block.explanation,
    questionLatex,
    images: finalImages,
    hasEquation: Boolean(
      questionLatex || /\$|\\frac|\\int|\\sum|\\sqrt|\\begin\{/.test(finalText)
    ),
    hasTable: collectedTables.length > 0 || block.hasTable,
    renderingMetadata: {
      ...(block.renderingMetadata || {}),
      tables: collectedTables
    },
    htmlFragment: html,
  };
}
