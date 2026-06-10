import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseXml, translateOmmlNode } from '../mathConverter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const filePath = path.join(__dirname, 'equation_table.docx');
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file('word/document.xml')?.async('string');
  
  const match = docXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/);
  if (match) {
    const tableXml = match[0];
    const parsed = parseXml(tableXml);
    const trs = parsed[0].children.filter(c => c.tag === 'tr');
    const cell = trs[1].children[1];
    
    let cellText = '';
    
    function walk(node) {
      if (typeof node === 'string') {
        console.log("Visiting text node:", node);
        cellText += node;
        return;
      }
      const tag = node.tag.toLowerCase();
      console.log("Visiting element node:", node.tag, "tag.toLowerCase():", tag);
      
      if (tag === 'omath' || tag === 'omathpara') {
        const latex = translateOmmlNode(node);
        console.log("Parsed oMath latex:", latex);
        cellText += ` $${latex.trim()}$ `;
        return;
      }
      if (tag === 't') {
        const txt = (node.children || []).join('');
        console.log("Parsed 't' text:", txt);
        cellText += txt;
        return;
      }
      if (node.children) {
        for (const child of node.children) {
          walk(child);
        }
      }
    }
    
    const ps = (cell.children || []).filter(n => typeof n !== 'string' && n.tag.toLowerCase() === 'p');
    for (const p of ps) {
      walk(p);
      cellText += '\n';
    }
    
    console.log("Final cellText:", JSON.stringify(cellText));
  }
}

main().catch(console.error);
