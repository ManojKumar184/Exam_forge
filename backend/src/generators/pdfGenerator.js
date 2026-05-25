import puppeteer from 'puppeteer';

/**
 * Render printable HTML to PDF (KaTeX, images, sections preserved via HTML/CSS).
 */
export async function generatePdfFromHtml(html) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 90000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8;margin:0 15mm;">
        ExamForge
      </div>`,
      footerTemplate: `<div style="font-size:9px;width:100%;text-align:center;color:#64748b;padding:0 15mm;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`,
      margin: { top: '22mm', bottom: '18mm', left: '15mm', right: '15mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
