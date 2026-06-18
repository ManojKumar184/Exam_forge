import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

const apiKey = process.env.NVIDIA_API_KEY;
console.log('Using API key:', apiKey ? apiKey.slice(0, 15) + '...' : 'none');

async function test() {
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const payload = {
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    messages: [{ role: 'user', content: 'Say hello in exactly 3 words.' }],
    temperature: 0.1,
    top_p: 0.95,
    max_tokens: 50,
  };

  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text);
    console.log('Time taken:', Date.now() - start, 'ms');
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
