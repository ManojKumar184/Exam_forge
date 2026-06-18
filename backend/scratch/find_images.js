import fs from 'fs/promises';
import mammoth from 'mammoth';

async function main() {
  const buffer = await fs.readFile('c:\\Users\\manoj555\\Desktop\\Exam_forge\\Physics_cleaned_dataset.docx');
  const res = await mammoth.convertToHtml({ buffer });
  const html = res.value;

  console.log('Mammoth HTML length:', html.length);
  
  // Find all img tags in HTML and print surrounding text
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  let count = 0;
  while ((match = imgRegex.exec(html)) !== null) {
    count++;
    const src = match[1];
    const index = match.index;
    const context = html.slice(Math.max(0, index - 200), Math.min(html.length, index + 300));
    console.log(`Image ${count} at index ${index}:`);
    console.log(`  Source: ${src.slice(0, 100)}...`);
    console.log(`  Context HTML:\n${context}`);
    console.log('='.repeat(50));
  }
}

main().catch(console.error);
