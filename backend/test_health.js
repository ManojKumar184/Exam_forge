import fetch from 'node-fetch';

async function run() {
  try {
    const res = await fetch('http://localhost:5000/api/health');
    console.log('localhost status:', res.status);
    const text = await res.text();
    console.log('localhost response:', text);
  } catch (err) {
    console.error('localhost error:', err.message);
  }

  try {
    const res = await fetch('http://127.0.0.1:5000/api/health');
    console.log('127.0.0.1 status:', res.status);
    const text = await res.text();
    console.log('127.0.0.1 response:', text);
  } catch (err) {
    console.error('127.0.0.1 error:', err.message);
  }
}

run().catch(console.error);
