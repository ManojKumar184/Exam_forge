import fs from 'fs';
import path from 'path';

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
  console.log('[AUTH] Login successful');
}

async function uploadFile(filePath) {
  console.log(`[UPLOAD] Uploading ${filePath}...`);
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const formData = new FormData();
  formData.append('file', blob, 'Physics_cleaned_dataset.docx');

  const res = await fetch(`${API}/document-classification/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}` },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed with status ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.sessionId;
}

async function run() {
  await login();
  const filePath = './Physics_cleaned_dataset.docx';
  
  // 1. Upload
  const sessionId = await uploadFile(filePath);
  console.log(`[SUCCESS] Upload session created: ${sessionId}`);

  // 2. Process Batch
  console.log(`[BATCH] Processing batch of first question...`);
  const batchRes = await fetch(`${API}/document-classification/batch/${sessionId}`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ start: 0, end: 1 })
  });
  
  if (!batchRes.ok) {
    const text = await batchRes.text();
    throw new Error(`Batch processing failed: ${text}`);
  }
  const batchData = await batchRes.json();
  console.log(`[SUCCESS] Batch classifications:`, JSON.stringify(batchData, null, 2));

  // 3. Finalize
  console.log(`[FINALIZE] Finalizing session...`);
  const finalizeRes = await fetch(`${API}/document-classification/finalize/${sessionId}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });

  if (!finalizeRes.ok) {
    const text = await finalizeRes.text();
    throw new Error(`Finalize failed: ${text}`);
  }
  const finalizeData = await finalizeRes.json();
  console.log(`[SUCCESS] Session finalized successfully!`);
  console.log(`Summary Report:`, JSON.stringify(finalizeData.summary, null, 2));
}

run().catch(err => {
  console.error('[FAIL] Test failed:', err);
  process.exit(1);
});
