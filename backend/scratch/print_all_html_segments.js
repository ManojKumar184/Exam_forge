import { parseDocxXmlStructure } from '../src/extraction/docxAdvancedParser.js';
import { splitHtmlIntoQuestionSegments } from '../src/extraction/htmlQuestionParser.js';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';

const docxPath = path.resolve('../Physics_cleaned_dataset.docx');

async function main() {
  const buffer = fs.readFileSync(docxPath);
  const mammothHtml = await mammoth.convertToHtml({ buffer });
  const htmlSegments = splitHtmlIntoQuestionSegments(mammothHtml.value || '');

  console.log(`Total HTML segments: ${htmlSegments.length}`);
  htmlSegments.forEach((s, idx) => {
    console.log(`Segment ${idx}:`);
    console.log(`  Text: "${s.text.slice(0, 150)}..."`);
    console.log(`  Images count: ${s.images?.length || 0}`);
    if (s.images?.length > 0) {
      console.log(`  Images: ${JSON.stringify(s.images.map(img => img.slice(0, 50) + '...'))}`);
    }
  });
}

main().catch(console.error);
