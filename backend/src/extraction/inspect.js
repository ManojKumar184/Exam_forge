import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

function findFormats() {
  const pastePath = path.join(projectRoot, 'Pasted text(133).txt');
  if (fs.existsSync(pastePath)) {
    const rawText = fs.readFileSync(pastePath, 'utf8');
    const lines = rawText.split(/\r?\n/);
    
    for (let i = 0; i < Math.min(lines.length, 1000); i++) {
      const line = lines[i].trim();
      if (line.includes("detected") || line === "text/plain" || line === "text/html" || line === "text/rtf" || line.startsWith("text/")) {
        console.log(`Line ${i + 1}: ${line}`);
      }
    }
    
    // Check if there are other markers
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("---") || lines[i].includes("Copy") && lines[i].length < 20) {
        console.log(`Marker at Line ${i + 1}: ${lines[i]}`);
      }
    }
  }
}

findFormats();
