import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DOMParser } from 'linkedom';
import { extractStructuredBlocks, blocksToPlainText } from './clipboardIngestion.js';
import { runStagesReconstruction } from './reconstructionPipeline.js';
import { mergePasteSources } from './wordHtmlCleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

/**
 * Traverse and count DOM nodes & maximum nesting depth.
 */
function getDOMStats(htmlString) {
  if (!htmlString) return { nodeCount: 0, maxDepth: 0 };
  try {
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    let nodeCount = 0;
    let maxDepth = 0;

    function traverse(node, depth) {
      if (!node) return;
      nodeCount++;
      if (depth > maxDepth) {
        maxDepth = depth;
      }
      if (node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverse(node.childNodes[i], depth + 1);
        }
      }
    }

    traverse(doc.body || doc.documentElement, 1);
    return { nodeCount, maxDepth };
  } catch (err) {
    return { nodeCount: 0, maxDepth: 0, error: err.message };
  }
}

/**
 * Count VML, XML namespaces, and spans in html text.
 */
function countRawOfficeArtifacts(html) {
  if (!html) return { vmlCount: 0, xmlCount: 0, spanCount: 0 };
  const vmlMatches = html.match(/<v:|<o:shape|<v:imagedata|<o:OLEObject/gi) || [];
  const xmlMatches = html.match(/<\?xml|<w:|<o:|<xml>|xmlns:/gi) || [];
  const spanMatches = html.match(/<span\b/gi) || [];
  return {
    vmlCount: vmlMatches.length,
    xmlCount: xmlMatches.length,
    spanCount: spanMatches.length
  };
}

/**
 * Run stress test / replay.
 */
export async function runStressTest(fixtureName, payloadHtml, payloadPlain) {
  const t0 = performance.now();
  const mem0 = process.memoryUsage().heapUsed;

  const rawSize = payloadHtml.length;
  const rawStats = getDOMStats(payloadHtml);
  const rawArtifacts = countRawOfficeArtifacts(payloadHtml);

  console.log(`\n======================================================`);
  console.log(`STRESS TEST HARNESS: Replaying payload [${fixtureName}]`);
  console.log(`======================================================`);
  console.log(`Raw HTML size: ${(rawSize / 1024).toFixed(2)} KB (${rawSize} chars)`);
  console.log(`Raw DOM Node Count: ${rawStats.nodeCount}`);
  console.log(`Raw DOM Max Nesting Depth: ${rawStats.maxDepth}`);
  console.log(`VML tags detected in raw HTML: ${rawArtifacts.vmlCount}`);
  console.log(`XML/namespaced tags in raw HTML: ${rawArtifacts.xmlCount}`);
  console.log(`Spans in raw HTML: ${rawArtifacts.spanCount}`);

  // Step 1: Run Ingestion
  console.log(`\nRunning block extraction and cleanup...`);
  const blocks = extractStructuredBlocks(payloadHtml, payloadPlain);
  const plainFromBlocks = blocksToPlainText(blocks);
  
  // Clean using the actual ingestion module helper
  const cleaned = mergePasteSources({ html: payloadHtml, plain: payloadPlain });

  // Step 2: Run Reconstruction
  console.log(`Running 10-stage reconstruction pipeline...`);
  const result = await runStagesReconstruction(plainFromBlocks, cleaned.html, null, blocks, payloadHtml);

  const t1 = performance.now();
  const mem1 = process.memoryUsage().heapUsed;

  const durationMs = (t1 - t0).toFixed(2);
  const memoryDeltaMb = ((mem1 - mem0) / 1024 / 1024).toFixed(2);

  const cleanedHtml = result.debugInfo?.stages?.stage1?.after_html || '';
  const cleanedSize = cleanedHtml.length;
  const cleanedStats = getDOMStats(cleanedHtml);
  const cleanedArtifacts = countRawOfficeArtifacts(cleanedHtml);

  const compressionRatio = cleanedSize > 0 ? (rawSize / cleanedSize).toFixed(2) : '0';
  const nodeReduction = rawStats.nodeCount - cleanedStats.nodeCount;
  const vmlRemoved = rawArtifacts.vmlCount - cleanedArtifacts.vmlCount;
  const xmlRemoved = rawArtifacts.xmlCount - cleanedArtifacts.xmlCount;
  const spanFlattened = rawArtifacts.spanCount - cleanedArtifacts.spanCount;

  // Placeholder and validation metrics
  const placeholderCount = Object.keys(result.debugInfo?.shieldedMathPlaceholders || {}).length;
  const reconstructionSuccess = result.stem ? true : false;

  console.log(`\n------------------------------------------------------`);
  console.log(`BENCHMARK & STABILITY STATISTICS`);
  console.log(`------------------------------------------------------`);
  console.log(`Processing Latency: ${durationMs} ms`);
  console.log(`Memory Delta: ${memoryDeltaMb} MB`);
  console.log(`Cleaned HTML size: ${(cleanedSize / 1024).toFixed(2)} KB (${cleanedSize} chars)`);
  console.log(`Cleanup Compression Ratio: ${compressionRatio}x`);
  console.log(`Cleaned DOM Node Count: ${cleanedStats.nodeCount} (Reduced by ${nodeReduction})`);
  console.log(`Cleaned DOM Max Nesting Depth: ${cleanedStats.maxDepth}`);
  console.log(`VML Purged Count: ${vmlRemoved}`);
  console.log(`XML Block/Namespaces Purged: ${xmlRemoved}`);
  console.log(`Spans Flattened: ${spanFlattened}`);
  console.log(`Math Placeholders Shielded: ${placeholderCount}`);
  console.log(`Reconstruction Success: ${reconstructionSuccess ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Stem length: ${result.stem.length} chars`);
  console.log(`Options extracted: ${result.options.length}`);
  console.log(`Detected Question Type: ${result.questionType} (${result.subtype})`);
  console.log(`Parser Confidence: ${result.confidence * 100}%`);
  console.log(`KaTeX Malformed Expressions: ${result.debugInfo?.stages?.stage11?.malformed_expressions?.length || 0}`);
  console.log(`======================================================\n`);

  return {
    fixtureName,
    rawSize,
    cleanedSize,
    compressionRatio,
    rawNodeCount: rawStats.nodeCount,
    cleanedNodeCount: cleanedStats.nodeCount,
    nodeReduction,
    rawMaxDepth: rawStats.maxDepth,
    cleanedMaxDepth: cleanedStats.maxDepth,
    vmlRemoved,
    xmlRemoved,
    spanFlattened,
    placeholderCount,
    reconstructionSuccess,
    durationMs,
    memoryDeltaMb,
    result
  };
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Read target file
  const rawPath = path.join(__dirname, '../../../Pasted text(133).txt');
  if (!fs.existsSync(rawPath)) {
    console.error(`Error: Raw clipboard file not found at ${rawPath}`);
    process.exit(1);
  }

  const rawText = fs.readFileSync(rawPath, 'utf8');
  const lines = rawText.split(/\r?\n/);
  
  let plainIndex = -1;
  let htmlIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === 'text/plain') {
      plainIndex = i;
    } else if (line === 'text/html') {
      htmlIndex = i;
    }
  }

  if (plainIndex === -1 || htmlIndex === -1) {
    console.error("Could not find text/plain or text/html markers in payload file.");
    process.exit(1);
  }

  let plainTextLines = [];
  for (let i = plainIndex + 2; i < htmlIndex; i++) {
    plainTextLines.push(lines[i]);
  }
  const plainPayload = plainTextLines.join('\n').trim();

  let htmlTextLines = [];
  for (let i = htmlIndex + 2; i < lines.length; i++) {
    htmlTextLines.push(lines[i]);
  }
  const htmlPayload = htmlTextLines.join('\n').trim();

  const mode = process.argv[2] || 'test';

  if (mode === 'test' || mode === 'run') {
    const stats = await runStressTest('pasted_text_133_default', htmlPayload, plainPayload);
    
    // Save as fixture json
    const fixturePath = path.join(FIXTURES_DIR, 'pasted_text_133.json');
    fs.writeFileSync(fixturePath, JSON.stringify({
      name: 'pasted_text_133',
      html: htmlPayload,
      plain: plainPayload,
      stats: {
        rawSize: stats.rawSize,
        cleanedSize: stats.cleanedSize,
        durationMs: stats.durationMs,
        memoryDeltaMb: stats.memoryDeltaMb
      }
    }, null, 2));
    console.log(`Saved raw payload regression fixture to: ${fixturePath}`);

    // Snapshot stage outputs
    const snapshotPath = path.join(FIXTURES_DIR, 'pasted_text_133_stages.json');
    const stages = stats.result.debugInfo?.stages || {};
    fs.writeFileSync(snapshotPath, JSON.stringify(stages, null, 2));
    console.log(`Saved stage-by-stage snapshots to: ${snapshotPath}`);
  } else if (mode === 'replay') {
    const name = process.argv[3];
    if (!name) {
      console.log('Available fixtures:');
      const files = fs.readdirSync(FIXTURES_DIR);
      files.forEach(f => console.log(`  - ${f.replace('.json', '')}`));
    } else {
      const fixturePath = path.join(FIXTURES_DIR, `${name}.json`);
      if (!fs.existsSync(fixturePath)) {
        console.error(`Fixture not found: ${fixturePath}`);
        process.exit(1);
      }
      const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      await runStressTest(data.name, data.html, data.plain);
    }
  }
}
