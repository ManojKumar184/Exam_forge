import fs from 'fs/promises';
import { parseDocxXmlStructure, buildTextFromDocxStructure } from '../backend/src/extraction/docxAdvancedParser.js';
import { splitTextIntoBlocks } from '../backend/src/extraction/normalizeQuestions.js';

async function test() {
  const buffer = await fs.readFile('Physics_cleaned_dataset.docx');
  const structure = await parseDocxXmlStructure(buffer);
  const xmlOrdered = buildTextFromDocxStructure(structure);
  const blocks = splitTextIntoBlocks(xmlOrdered);
  
  console.log(`Detected ${blocks.length} blocks for Physics_cleaned_dataset.docx.`);
}

test().catch(console.error);
