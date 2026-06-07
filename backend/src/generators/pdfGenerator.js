import puppeteer from 'puppeteer';

/**
 * Render printable HTML to PDF (KaTeX, images, sections preserved via HTML/CSS).
 */
export async function generatePdfFromHtml(html, options = {}) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 90000 });
    
    // Map margin presets
    let margin = { top: '22mm', bottom: '18mm', left: '15mm', right: '15mm' };
    if (options.margin === 'narrow') {
      margin = { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' };
    } else if (options.margin === 'wide') {
      margin = { top: '30mm', bottom: '30mm', left: '25mm', right: '25mm' };
    }

    // Dynamic headers and footers
    const showPageNo = options.showPageNumber !== false;
    const footerInstName = options.footerInstitutionName || options.institutionName || 'ExamForge';
    const footerCustomText = options.customFooterText || '';
    const pageNoHtml = showPageNo ? 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>' : '';

    const footerTemplate = `<div style="font-size:8px;width:100%;display:flex;justify-content:space-between;color:#64748b;padding:0 15mm;font-family:'Segoe UI',Arial,sans-serif;">
      <span>${footerInstName}</span>
      <span>${footerCustomText}</span>
      <span>${pageNoHtml}</span>
    </div>`;

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8;margin:0 15mm;font-family:'Segoe UI',Arial,sans-serif;">
        ${options.examinationName || 'ExamForge'}
      </div>`,
      footerTemplate,
      margin,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
