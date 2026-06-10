import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const filePath = path.join(__dirname, 'equation_table.docx');
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file('word/document.xml')?.async('string');
  console.log("Document XML length:", docXml?.length);
  
  // Find all table text
  const match = docXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/);
  if (match) {
    console.log("Found Table XML:\n", match[0].substring(0, 1500));
  } else {
    console.log("No table found in XML!");
  }
}

main().catch(console.error);
