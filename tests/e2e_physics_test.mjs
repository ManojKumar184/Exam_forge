/**
 * E2E Test: Physics_cleaned_dataset.docx
 * 
 * Runs the complete pipeline:
 * 1. Auth login
 * 2. File upload
 * 3. Poll for processing completion
 * 4. Extract staged questions
 * 5. Compare results against ground truth
 */

let TOKEN = '';
const API = 'http://localhost:5000/api';

async function login() {
  console.log('[AUTH] Logging in dynamically...');
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@examforge.com', password: 'Admin@123' })
  });
  if (!res.ok) {
    throw new Error(`Login failed with status ${res.status}`);
  }
  const data = await res.json();
  if (!data.success || !data.data?.accessToken) {
    throw new Error(`Invalid login response: ${JSON.stringify(data)}`);
  }
  TOKEN = data.data.accessToken;
  console.log('[AUTH] Login successful, token obtained');
}

const GROUND_TRUTH = {
  totalQuestions: 32,
  numericalQuestions: 7,
  multipleCorrectMCQs: 1,
  matchTheFollowing: 1,
  singleCorrectMCQs: 23,
  totalImages: 7,
  imagesInTable: 1,
};

async function api(path, options = {}) {
  const url = `${API}${path}`;
  const headers = { 'Authorization': `Bearer ${TOKEN}`, ...options.headers };
  const res = await fetch(url, { ...options, headers });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
}

async function uploadFile(filePath) {
  const fs = await import('fs');
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const formData = new FormData();
  formData.append('file', blob, 'Physics_cleaned_dataset.docx');

  const res = await fetch(`${API}/uploads`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}` },
    body: formData,
  });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
}

async function pollUpload(uploadId, maxWaitMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { body } = await api(`/uploads/${uploadId}`);
    if (!body.success) {
      console.log(`[POLL] Error: ${JSON.stringify(body.error)}`);
      return null;
    }
    const upload = body.data;
    console.log(`[POLL] Status=${upload.status} Stage=${upload.processingStage} Progress=${upload.progress}%`);
    
    if (upload.status === 'completed') return upload;
    if (upload.status === 'failed') {
      console.log(`[FAIL] ${upload.processingError}`);
      return upload;
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log(`[TIMEOUT] Polling timed out after ${maxWaitMs}ms`);
  return null;
}

function extractImages(questions) {
  const allImages = [];
  questions.forEach((q, idx) => {
    const images = new Set();
    if (q.questionImages?.length) q.questionImages.forEach(u => images.add(u));
    if (q.imageMetadata?.length) q.imageMetadata.map(i => i.url).forEach(u => images.add(u));
    if (q.figures?.length) q.figures.map(f => f.url).forEach(u => images.add(u));
    if (q.diagrams?.length) q.diagrams.map(d => d.url).forEach(u => images.add(u));
    const uniqueImages = [...images].filter(Boolean);
    if (uniqueImages.length) allImages.push({ idx, count: uniqueImages.length, images: uniqueImages });
  });
  return allImages;
}

async function main() {
  await login();
  const totalStart = Date.now();
  
  console.log('='.repeat(70));
  console.log('E2E TEST: Physics_cleaned_dataset.docx');
  console.log('='.repeat(70));
  
  // STEP 1: Upload
  console.log('\n--- STEP 1: Upload ---');
  const filePath = './Physics_cleaned_dataset.docx';
  const fs = await import('fs');
  console.log(`File: ${filePath} (${fs.statSync(filePath).size} bytes)`);
  
  const uploadRes = await uploadFile(filePath);
  if (!uploadRes.ok) {
    console.error('Upload failed:', JSON.stringify(uploadRes.body));
    return;
  }
  const uploadId = uploadRes.body.data?.id || uploadRes.body.data?._id;
  console.log(`Upload ID: ${uploadId}`);
  console.log(`Response: ${JSON.stringify(uploadRes.body, null, 2)}`);
  
  // STEP 2: Poll
  console.log('\n--- STEP 2: Processing ---');
  const upload = await pollUpload(uploadId, 600000);
  
  if (!upload || upload.status === 'failed') {
    console.error('Processing failed or timed out');
    if (upload) console.error(JSON.stringify(upload, null, 2));
    return;
  }
  
  const totalDur = Date.now() - totalStart;
  console.log(`\nTotal: ${(totalDur/1000).toFixed(1)}s`);
  
  // STEP 3: Staged questions
  console.log('\n--- STEP 3: Analysis ---');
  const stagedRaw = upload.staged_questions || upload.stagedQuestions || [];
  const staged = stagedRaw.map(q => ({
    ...q,
    questionText: q.question_text || q.questionText,
    questionType: q.question_type || q.questionType,
    questionImages: q.question_images || q.questionImages,
    imageMetadata: q.image_metadata || q.imageMetadata,
    aiConfidence: q.ai_confidence || q.aiConfidence,
    extractionWarnings: q.extraction_warnings || q.extractionWarnings,
  }));
  console.log(`Staged: ${staged.length}`);
  
  // Count by type
  const mcqSingle = staged.filter(q => {
    const t = (q.questionType || '').toUpperCase();
    return t === 'MCQ' || t === 'MCQ_SINGLE';
  }).length;
  
  const mcqMultiple = staged.filter(q => {
    const t = (q.questionType || '').toUpperCase();
    return t === 'MCQ_MULTIPLE' || t === 'MCQ_MULTI';
  }).length;
  
  const numerical = staged.filter(q => {
    const t = (q.questionType || '').toUpperCase();
    return ['NUMERICAL','NUMERICAL_INTEGER','INTEGER','INTEGER_TYPE'].includes(t);
  }).length;
  
  const matchFollowing = staged.filter(q => {
    const t = (q.questionType || '').toUpperCase();
    return t === 'MATCH_FOLLOWING' || t.includes('MATCH');
  }).length;
  
  const descriptive = staged.filter(q => {
    const t = (q.questionType || '').toUpperCase();
    return t === 'DESCRIPTIVE';
  }).length;
  
  const images = extractImages(staged);
  const totalImages = images.reduce((s, i) => s + i.count, 0);
  const qWithImages = images.length;
  
  // Comparison table
  const cats = [
    ['Total questions', 32, staged.length],
    ['Single-correct MCQ', 23, mcqSingle],
    ['Multiple-correct MCQ', 1, mcqMultiple],
    ['Match-the-Following', 1, matchFollowing],
    ['Numerical/Integer', 7, numerical],
    ['Descriptive', 0, descriptive],
    ['Total images', 7, totalImages],
    ['Questions with images', '>=1', qWithImages],
  ];
  
  console.log('\nCATEGORY COMPARISON:');
  console.log('-'.repeat(65));
  let allMatch = true;
  for (const [name, exp, act] of cats) {
    const ok = exp === '>=1' ? act >= 1 : act === exp;
    if (!ok) allMatch = false;
    const icon = ok ? '✅' : '❌';
    console.log(`${icon} ${name.padEnd(25)} Expected: ${String(exp).padEnd(5)} Actual: ${act}`);
  }
  
  // Performance
  const qpm = staged.length / (totalDur / 60000);
  console.log(`\nPERFORMANCE:`);
  console.log(`  Duration: ${(totalDur/1000).toFixed(1)}s`);
  console.log(`  QPM: ${qpm.toFixed(1)}`);
  console.log(`  100+ QPM: ${qpm >= 100 ? '✅' : '❌'}`);
  
  // Print each staged question
  console.log('\nDETAILED QUESTIONS:');
  console.log('='.repeat(70));
  staged.forEach((q, i) => {
    const txt = (q.questionText || '').slice(0, 90).replace(/\n/g, ' ');
    const opts = q.options?.length || 0;
    const imgC = (q.questionImages?.length || 0) + (q.figures?.length || 0) + (q.diagrams?.length || 0);
    const warns = q.extractionWarnings?.slice(0, 2).join('; ') || '';
    console.log(`Q${i+1}: [${q.questionType}] conf=${q.aiConfidence} class=${q.class} diff=${q.difficulty} opts=${opts} imgs=${imgC} status=${q.status}`);
    console.log(`     ${txt}`);
    if (warns) console.log(`     ⚠ ${warns}`);
    console.log('');
  });
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`OVERALL: ${allMatch ? '✅ ALL GROUND TRUTH MATCHES' : '❌ MISMATCHES FOUND'}`);
  console.log(`${'='.repeat(70)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
