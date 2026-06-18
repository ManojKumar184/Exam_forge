const apiKey = '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';
const url = 'https://integrate.api.nvidia.com/v1/chat/completions';

async function test() {
  console.log("Sending simple HTTP POST to NVIDIA...");
  const payload = {
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    messages: [{ role: "user", content: "Hello, answer in 2 words." }],
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
      body: JSON.stringify(payload)
    });
    console.log("HTTP status:", res.status);
    const json = await res.json();
    console.log("Response JSON:", JSON.stringify(json, null, 2));
    console.log("Time taken:", (Date.now() - start) / 1000, "seconds");
  } catch (e) {
    console.error("Fetch failed:", e);
  }
}
test();
