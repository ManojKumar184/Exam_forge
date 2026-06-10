import fs from 'fs/promises';
import mammoth from 'mammoth';

async function test() {
  const buffer = await fs.readFile('Physics.docx');
  const rawTextFallback = await mammoth.extractRawText({ buffer });
  const lines = rawTextFallback.value.split('\n').filter(l => l.trim());
  console.log(`Mammoth Lines Count: ${lines.length}`);
  lines.forEach((l, i) => console.log(`${i+1}: ${l}`));
}

test().catch(console.error);
