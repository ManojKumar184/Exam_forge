import fs from 'fs';
import path from 'path';
import { parseDocxXmlStructure } from '../src/extraction/docxAdvancedParser.js';

async function main() {
  const docxPath = path.resolve('..', 'Physics_cleaned_dataset.docx');
  console.log('Reading file:', docxPath);
  const buffer = fs.readFileSync(docxPath);
  const structure = await parseDocxXmlStructure(buffer);
  
  console.log('Total Paragraphs:', structure.paragraphs.length);
  console.log('Total Tables:', structure.tables.length);
  
  fs.writeFileSync('scratch/paragraphs.json', JSON.stringify(structure.paragraphs, null, 2));
  console.log('Saved paragraphs to scratch/paragraphs.json');

  // Print section headers or paragraphs with section info
  const sections = [...new Set(structure.paragraphs.map(p => p.section))];
  console.log('Sections found:', sections);

  const paragraphsWithSectionHeaders = structure.paragraphs.filter(p => p.isSection);
  console.log('Section paragraphs:', paragraphsWithSectionHeaders.map(p => ({ text: p.text, section: p.section })));
}

main().catch(console.error);
