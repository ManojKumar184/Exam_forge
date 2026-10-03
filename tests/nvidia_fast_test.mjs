const apiKey = process.env.NVIDIA_API_KEY;
if (!apiKey) {
  console.log('Skipping test: NVIDIA_API_KEY environment variable is not set.');
  process.exit(0);
}
const url = 'https://integrate.api.nvidia.com/v1/chat/completions';

async function testModel(model) {
  const payload = {
    model: model,
    messages: [{ role: "user", content: "State the capital of France in one word." }],
    temperature: 0.1,
    max_tokens: 50
  };
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });
    const duration = (Date.now() - start) / 1000;
    if (res.ok) {
      const json = await res.json();
      console.log(`✅ [${model}] status: ${res.status}, time: ${duration}s, content: "${json.choices?.[0]?.message?.content?.trim()}"`);
      return true;
    } else {
      const txt = await res.text();
      console.log(`❌ [${model}] status: ${res.status}, time: ${duration}s, error: "${txt.slice(0, 100)}"`);
      return false;
    }
  } catch (e) {
    const duration = (Date.now() - start) / 1000;
    console.log(`❌ [${model}] failed: ${e.message} (after ${duration}s)`);
    return false;
  }
}

async function run() {
  const models = [
    'deepseek-ai/deepseek-coder-6.7b-instruct',
    'deepseek-ai/deepseek-v4-flash',
    'deepseek-ai/deepseek-v4-pro',
    'qwen/qwen3-next-80b-a3b-instruct',
    'qwen/qwen3.5-122b-a10b',
    'google/gemma-2-2b-it',
    'google/gemma-3-4b-it',
    'mistralai/mistral-7b-instruct-v0.3',
    'mistralai/mistral-nemotron',
    'mistralai/mixtral-8x7b-instruct-v0.1',
    'meta/llama-3.1-8b-instruct',
    'meta/llama-3.2-3b-instruct',
    'nvidia/llama-3.1-nemotron-51b-instruct',
    'nvidia/llama-3.1-nemotron-70b-instruct'
  ];
  for (const m of models) {
    await testModel(m);
  }
}

run();
