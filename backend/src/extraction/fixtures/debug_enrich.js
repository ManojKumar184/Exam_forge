import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractDocxQuestions } from '../extractDocxQuestions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

async function main() {
  const filePath = path.join(__dirname, 'equation_table.docx');
  const result = await extractDocxQuestions(filePath, {
    imageDir: path.join(projectRoot, 'backend/uploads/images'),
  });
  
  console.log("Extracted Questions:", JSON.stringify(result.questions, null, 2));
}

main().catch(console.error);
