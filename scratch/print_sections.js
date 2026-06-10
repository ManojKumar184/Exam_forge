import fs from 'fs/promises';
import { parseDocxXmlStructure, buildTextFromDocxStructure } from '../backend/src/extraction/docxAdvancedParser.js';

async function test() {
  const buffer = await fs.readFile('Physics.docx');
  const structure = await parseDocxXmlStructure(buffer);
  const xmlOrdered = buildTextFromDocxStructure(structure);
  const lines = xmlOrdered.split('\n');
  
  console.log(`--- lines from 50 to ${lines.length} ---`);
  lines.slice(49).forEach((l, i) => console.log(`${i+50}: ${l}`));
}

test().catch(console.error);
