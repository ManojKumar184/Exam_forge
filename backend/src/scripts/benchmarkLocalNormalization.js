import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateNormalizedQuestionBatch } from '../extraction/documentIntelligence/normalizationContract.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusPath = path.resolve(__dirname, '../extraction/documentIntelligence/fixtures/local-normalization-benchmark.json');
const baseUrl = (process.env.LOCAL_AI_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const cliArgs = process.argv.slice(2);
const outputIndex = cliArgs.indexOf('--output');
const outputPath = outputIndex >= 0 ? path.resolve(cliArgs[outputIndex + 1]) : null;
if (outputIndex >= 0) cliArgs.splice(outputIndex, 2);
const models = cliArgs;
if (!models.length) {
  console.error('Usage: node src/scripts/benchmarkLocalNormalization.js <model> [model ...]');
  process.exit(2);
}

const corpus = JSON.parse(await fs.readFile(corpusPath, 'utf8'));
const systemPrompt = [
  'Convert the supplied ordered document evidence into exactly one objective question. Extract question stem, options, and answer exactly; do not explain.',
  'Allowed types: MCQ_SINGLE, MCQ_MULTIPLE, TRUE_FALSE, FILL_BLANK, NUMERICAL, NUMERICAL_INTEGER, MATCH_FOLLOWING, ASSERTION_REASON, UNCLASSIFIED.',
  'Cite source IDs. Do not invent text or answers. Exclude explicit answer lines from the stem. Preserve all option meaning and order.',
  'If uncertain use UNCLASSIFIED and status needs_review. Answer is the source answer label or text as a string, or null if absent.',
].join(' ');

function outputSchema(blockIds) {
  return {
    type: 'object', additionalProperties: false, required: ['questions'],
    properties: { questions: { type: 'array', minItems: 1, maxItems: 1, items: {
      type: 'object', additionalProperties: false,
      required: ['sourceEvidence', 'type', 'content', 'options', 'answer', 'metadata', 'status'],
      properties: {
        sourceEvidence: { type: 'array', items: { type: 'string', enum: blockIds } },
        type: { type: 'string', enum: ['MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE','FILL_BLANK','NUMERICAL','NUMERICAL_INTEGER','MATCH_FOLLOWING','ASSERTION_REASON','UNCLASSIFIED'] },
        content: { type: 'object', additionalProperties: false, required: ['blocks'], properties: { blocks: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['type','text'], properties: { type: { type: 'string', enum: ['text'] }, text: { type: 'string' } } } } } },
        options: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label','text'], properties: { label: { type: 'string' }, text: { type: 'string' } } } },
        answer: { type: ['string','null'] }, metadata: { type: 'object' },
        status: { type: 'string', enum: ['pending','needs_review'] },
      },
    } } },
  };
}

function flattenText(question) {
  return (question?.content?.blocks || []).map((block) => block.text || '').join(' ').replace(/\s+/g, ' ').trim();
}

function normalizeAnswer(value) {
  if (value && typeof value === 'object' && 'value' in value) value = value.value;
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}

async function requestModel(model, item) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(180000),
    body: JSON.stringify({
      model,
      stream: false,
      format: outputSchema(item.blocks.map((block) => block.id)),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ documentTemplate: { questionLayout: 'AUTO_DETECT', answerLayout: 'AUTO_DETECT' }, chunk: { id: item.id, sequence: 1, isFirstChunk: true, isLastChunk: true }, continuation: null, blocks: item.blocks }) },
      ],
      options: { temperature: 0, num_ctx: 4096, num_predict: 400 },
    }),
  });
  const elapsedMs = performance.now() - started;
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
  const payload = await response.json();
  let parsed;
  try { parsed = JSON.parse(payload.message?.content || ''); } catch { parsed = null; }
  return { parsed, elapsedMs, promptTokens: payload.prompt_eval_count ?? null, outputTokens: payload.eval_count ?? null };
}

async function sampleRunnerWorkingSet() {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      '$p=Get-Process llama-server -ErrorAction SilentlyContinue; if($p){($p|Measure-Object WorkingSet64 -Sum).Sum}else{0}',
    ], { timeout: 5000, windowsHide: true });
    return Number(stdout.trim()) || 0;
  } catch { return null; }
}

const tagsResponse = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
if (!tagsResponse.ok) throw new Error(`Local AI runtime unavailable at ${baseUrl}`);
const availableModels = (await tagsResponse.json()).models || [];
const reports = [];
let sampledRunnerWorkingSetMaxBytes = 0;

for (const model of models) {
  const installed = availableModels.find((entry) => entry.name === model || entry.model === model);
  if (!installed) throw new Error(`Model is not installed locally: ${model}`);
  const items = [];
  for (const sample of corpus) {
    const memoryBefore = await sampleRunnerWorkingSet();
    if (memoryBefore != null) sampledRunnerWorkingSetMaxBytes = Math.max(sampledRunnerWorkingSetMaxBytes, memoryBefore);
    const output = await requestModel(model, sample);
    const memoryAfter = await sampleRunnerWorkingSet();
    if (memoryAfter != null) sampledRunnerWorkingSetMaxBytes = Math.max(sampledRunnerWorkingSetMaxBytes, memoryAfter);
    const checked = validateNormalizedQuestionBatch(output.parsed, { blocks: sample.blocks });
    const question = checked.success ? checked.data.questions[0] : null;
    const actualOptions = (question?.options || []).map((option) => String(option.text || '').trim());
    const expected = sample.expected;
    const expectedBlockIds = sample.blocks.map((block) => block.id);
    const coverage = new Set(question?.sourceEvidence || []);
    const allExpectedEvidence = expectedBlockIds.every((id) => coverage.has(id));
    const inventedEvidence = [...coverage].some((id) => !expectedBlockIds.includes(id));
    const fieldScores = {
      type: question?.type === expected.type,
      stem: flattenText(question) === expected.stem,
      options: JSON.stringify(actualOptions) === JSON.stringify(expected.options),
      answer: normalizeAnswer(question?.answer) === normalizeAnswer(expected.answer),
      schemaValid: checked.success,
      evidenceIdsValid: checked.success && !inventedEvidence,
      sourceCoverage: allExpectedEvidence,
    };
    items.push({ id: sample.id, ...fieldScores, elapsedMs: Math.round(output.elapsedMs), promptTokens: output.promptTokens, outputTokens: output.outputTokens, prediction: question ? { type: question.type, stem: flattenText(question), options: actualOptions, answer: question.answer, sourceEvidence: question.sourceEvidence } : null, validationIssues: checked.success ? [] : checked.error.issues.map((issue) => issue.message) });
  }
  const keys = Object.keys(items[0] || {}).filter((key) => ['type', 'stem', 'options', 'answer', 'schemaValid', 'evidenceIdsValid', 'sourceCoverage'].includes(key));
  const scores = Object.fromEntries(keys.map((key) => [key, items.filter((item) => item[key]).length / (items.length || 1)]));
  const times = items.map((item) => item.elapsedMs).sort((a, b) => a - b);
  reports.push({
    model,
    artifactBytes: installed.size,
    quantization: installed.details?.quantization_level || 'unknown',
    corpusSize: items.length,
    scores,
    exactCasePassRate: items.filter((item) => ['type', 'stem', 'options', 'answer', 'schemaValid', 'evidenceIdsValid'].every((key) => item[key])).length / (items.length || 1),
    averageLatencyMs: Math.round(times.reduce((a, b) => a + b, 0) / (times.length || 1)),
    p95LatencyMs: times[Math.max(0, Math.ceil(times.length * 0.95) - 1)] || 0,
    questionsPerMinute: times.reduce((sum, value) => sum + value, 0) ? Math.round(items.length / (times.reduce((sum, value) => sum + value, 0) / 60000) * 100) / 100 : null,
    peakRamBytes: null,
    sampledRunnerWorkingSetMaxBytes: sampledRunnerWorkingSetMaxBytes || null,
    sampledMemoryScope: process.platform === 'win32' ? 'sum of llama-server working set sampled before/after each inference; not a peak guarantee' : 'unavailable on this platform',
    unavailableMetrics: ['peakRamBytes', 'VRAM', 'imageAssociation', 'equationPreservation', 'tableStructureAccuracy', 'chunkBoundaryContinuation', 'largeDocumentThroughput'],
    items,
  });
}

const result = { benchmark: 'examforge-local-normalization/v1', corpusPath: path.relative(process.cwd(), corpusPath), notes: 'Hand-authored synthetic evidence with exact expected output; small smoke corpus, not statistically representative.', reports };
const serialized = JSON.stringify(result, null, 2);
if (outputPath) await fs.writeFile(outputPath, `${serialized}\n`, 'utf8');
console.log(outputPath ? `Wrote benchmark report to ${outputPath}` : serialized);
