import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import JSZip from 'jszip';
import { fileURLToPath } from 'url';
import { DOMParser } from 'linkedom';
import { convertHtmlMathToLatex } from './mathConverter.js';
import { extractOfficeSemantics } from './reconstructionPipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const SNAPSHOT_PATH = path.join(__dirname, 'fixtures', 'math_regression_snapshots.json');

function computeHash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Traverse DOM tree and collect math-bearing nodes
 */
function collectMathNodes(node, fragments) {
  if (!node || node.nodeType !== 1) return;

  const rawTag = node.tagName.toLowerCase();
  let tag = rawTag;
  const colonIdx = tag.indexOf(':');
  if (colonIdx !== -1) {
    tag = tag.slice(colonIdx + 1);
  }

  // To avoid duplicate nested elements, we traverse children first
  const children = Array.from(node.childNodes);
  for (const child of children) {
    collectMathNodes(child, fragments);
  }

  if (['omath', 'omathpara', 'math', 'oleobject', 'imagedata', 'shape'].includes(tag)) {
    fragments.push({
      raw: node.toString(),
      tag,
      rawTag
    });
  }
}

/**
 * Extract math nodes from a DOCX file
 */
async function extractMathFromDocx(filePath) {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) return [];

  const fragments = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<html><body>${docXml}</body></html>`, 'text/html');
    collectMathNodes(doc.body, fragments);
  } catch (err) {
    console.error(`Error parsing XML for ${path.basename(filePath)}:`, err);
  }
  return fragments;
}

/**
 * Extracts math nodes from the HTML clipboard payload of Pasted text(133).txt
 */
function extractMathFromClipboardFile(filePath) {
  const rawText = fs.readFileSync(filePath, 'utf8');
  const lines = rawText.split(/\r?\n/);
  
  let htmlIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'text/html') {
      htmlIndex = i;
      break;
    }
  }

  if (htmlIndex === -1) return [];

  const htmlPayload = lines.slice(htmlIndex + 2).join('\n').trim();
  const fragments = [];

  try {
    const parser = new DOMParser();
    // Parse directly since htmlPayload already contains <html>
    const doc = parser.parseFromString(htmlPayload, 'text/html');
    collectMathNodes(doc.body || doc.documentElement, fragments);
  } catch (err) {
    console.error("Error parsing clipboard HTML:", err);
  }

  return fragments;
}

function parseFallbackChain(rawXml, latex) {
  const hasTagLeak = /<[a-z0-9_:-]+[\s>]/i.test(latex) || latex.includes('<r>') || latex.includes('<t>');
  let braceCount = 0;
  for (const char of latex) {
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
  }
  return {
    hasTagLeak,
    bracesBalanced: braceCount === 0,
    parserUsed: rawXml.toLowerCase().includes('math') ? 'MathML/OMML' : 'VML/OLE'
  };
}

async function generateSnapshots() {
  console.log("Generating Math Regression Snapshots...");
  const snapshots = [];

  const sources = [
    { name: 'Physics.docx', path: path.join(projectRoot, 'Physics.docx'), type: 'docx' },
    { name: 'MATHS JUT - 40 QUESTION.docx', path: path.join(projectRoot, 'MATHS JUT - 40 QUESTION.docx'), type: 'docx' },
    { name: 'Pasted text(133).txt', path: path.join(projectRoot, 'Pasted text(133).txt'), type: 'txt' }
  ];

  let idCounter = 1;
  const seenRaw = new Set();

  for (const src of sources) {
    if (!fs.existsSync(src.path)) {
      console.warn(`Source file not found: ${src.path}`);
      continue;
    }

    console.log(`Processing source: ${src.name}`);
    let fragments = [];
    if (src.type === 'docx') {
      fragments = await extractMathFromDocx(src.path);
    } else {
      fragments = extractMathFromClipboardFile(src.path);
    }

    console.log(`Extracted ${fragments.length} math nodes from ${src.name}`);

    for (const frag of fragments) {
      const normalizedRaw = frag.raw.trim().replace(/\s+/g, ' ');
      if (seenRaw.has(normalizedRaw)) continue;
      seenRaw.add(normalizedRaw);

      let reconstructed = '';
      try {
        if (frag.tag === 'oleobject' || frag.tag === 'imagedata' || frag.tag === 'shape') {
          const dummyHtml = `<html><body>${frag.raw}</body></html>`;
          const sem = extractOfficeSemantics(dummyHtml, '');
          const keys = Object.keys(sem.mathMap);
          if (keys.length > 0) {
            reconstructed = sem.mathMap[keys[0]];
          } else {
            reconstructed = ''; 
          }
        } else {
          reconstructed = convertHtmlMathToLatex(frag.raw);
        }
      } catch (err) {
        reconstructed = `ERROR: ${err.message}`;
      }

      if (!reconstructed || !reconstructed.trim()) {
        continue;
      }

      const hash = computeHash(reconstructed);
      const fallback = parseFallbackChain(frag.raw, reconstructed);

      snapshots.push({
        id: idCounter++,
        source: src.name,
        type: frag.tag,
        original: frag.raw,
        expected_latex: reconstructed,
        expected_hash: hash,
        fallback_chain: fallback,
        unresolved_metadata: {
          length: frag.raw.length,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  const dir = path.dirname(SNAPSHOT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshots, null, 2));
  console.log(`Successfully saved ${snapshots.length} math snapshots to ${SNAPSHOT_PATH}`);
}

function verifySnapshots() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error(`Snapshot file not found at ${SNAPSHOT_PATH}. Please run with --generate first.`);
    process.exit(1);
  }

  console.log("=================================================");
  console.log("VERIFYING EQUATION PARSER REGRESSION SNAPSHOTS");
  console.log("=================================================");

  const snapshots = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  let passed = 0;
  let failed = 0;

  for (const snap of snapshots) {
    let currentLatex = '';
    try {
      if (snap.type === 'oleobject' || snap.type === 'imagedata' || snap.type === 'shape') {
        const dummyHtml = `<html><body>${snap.original}</body></html>`;
        const sem = extractOfficeSemantics(dummyHtml, '');
        const keys = Object.keys(sem.mathMap);
        if (keys.length > 0) {
          currentLatex = sem.mathMap[keys[0]];
        } else {
          currentLatex = '';
        }
      } else {
        currentLatex = convertHtmlMathToLatex(snap.original);
      }
    } catch (err) {
      currentLatex = `ERROR: ${err.message}`;
    }

    const currentHash = computeHash(currentLatex);
    if (currentHash === snap.expected_hash) {
      passed++;
    } else {
      failed++;
      console.error(`\n[REGRESSION FAILURE] Snapshot ID: ${snap.id} (${snap.source})`);
      console.error(`  Original XML: ${snap.original.substring(0, 200)}...`);
      console.error(`  Expected LaTeX: ${snap.expected_latex}`);
      console.error(`  Got LaTeX:      ${currentLatex}`);
      console.error(`  Expected Hash:  ${snap.expected_hash}`);
      console.error(`  Got Hash:       ${currentHash}`);
    }
  }

  console.log("=================================================");
  console.log(`Regression Snapshot Run Complete: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("All snapshots matched successfully!");
  }
}

const mode = process.argv[2] || '--verify';
if (mode === '--generate') {
  generateSnapshots().catch(console.error);
} else {
  verifySnapshots();
}
