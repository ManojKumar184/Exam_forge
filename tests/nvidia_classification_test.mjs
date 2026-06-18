import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: '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',
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const sampleQuestion = {
  text: "An electric dipole of dipole moment p is placed in a uniform electric field E. If the dipole is rotated through an angle theta from its equilibrium position, the work done in rotating the dipole is:",
  options: [
    "pE(1 - cos theta)",
    "pE sin theta",
    "pE cos theta",
    "2 pE"
  ]
};

const syllabusContext = `
EXAMS: JEE Main/NEET
CLASSES: 11/12
SUBJECTS: Physics: Physical World and Measurement, Kinematics, Laws of Motion, Work, Energy and Power, Rotational Motion, Gravitation, Mechanics of Solids and Fluids, Heat and Thermodynamics, Oscillations and Waves | Physics: Electrostatics, Current Electricity, Magnetism and EMI, Optics, Modern Physics
`;

const prompt = `You are an educational classification engine.

QUESTION:
${sampleQuestion.text}

OPTIONS:
A. ${sampleQuestion.options[0]}
B. ${sampleQuestion.options[1]}
C. ${sampleQuestion.options[2]}
D. ${sampleQuestion.options[3]}

Syllabus context:
${syllabusContext}

Use ONLY values from context above.
Return ONLY valid JSON:
{"class":"","subject":"","chapter":"","topic":"","difficulty":""}
`;

async function testModel(modelName, hasThinking = false, timeoutMs = 25000) {
  console.log(`\n\n========================================`);
  console.log(`Testing Model: ${modelName}`);
  console.log(`========================================`);

  const startTime = Date.now();
  let reasoningText = "";
  let contentText = "";

  try {
    const params = {
      model: modelName,
      messages: [{ "role": "user", "content": prompt }],
      temperature: 0.1,
      top_p: 0.95,
      max_tokens: 1024,
      stream: true,
    };

    if (hasThinking) {
      params.reasoning_budget = 1024;
      params.chat_template_kwargs = { "enable_thinking": true };
    }

    // Wrap the request in a timeout signal if specified
    const completion = await openai.chat.completions.create(params, {
      signal: AbortSignal.timeout(timeoutMs)
    });

    for await (const chunk of completion) {
      const reasoning = chunk.choices[0]?.delta?.reasoning_content;
      const content = chunk.choices[0]?.delta?.content || '';
      
      if (reasoning) {
        reasoningText += reasoning;
        process.stdout.write(reasoning);
      }
      if (content) {
        contentText += content;
        process.stdout.write(content);
      }
    }

    const duration = Date.now() - startTime;
    console.log("\n\n--- RESULTS ---");
    console.log(`Time taken: ${(duration / 1000).toFixed(2)} seconds`);
    if (reasoningText) {
      console.log("\n--- Reasoning Content ---\n", reasoningText.trim());
    }
    console.log("\n--- JSON Content ---\n", contentText.trim());

    // Validate JSON
    try {
      let jsonStr = contentText.trim();
      if (jsonStr.startsWith("```")) {
        const end = jsonStr.indexOf("```", 3);
        jsonStr = end !== -1 ? jsonStr.slice(3, end) : jsonStr.slice(3);
        if (jsonStr.includes("\n")) {
          jsonStr = jsonStr.split("\n").slice(1).join("\n").trim();
        }
      }
      const parsed = JSON.parse(jsonStr);
      console.log("\nParsed JSON:", parsed);

      const isClassCorrect = parsed.class == "12" || String(parsed.class).includes("12");
      const isSubjectCorrect = parsed.subject?.toLowerCase().includes("physics");
      const isChapterCorrect = parsed.chapter?.toLowerCase().includes("electrostatics") || parsed.chapter?.toLowerCase().includes("electric charges");

      console.log("\nAccuracy Assessment:");
      console.log(`- Class Correct (12): ${isClassCorrect ? "YES (100%)" : "NO (0%)"} (Value: "${parsed.class}")`);
      console.log(`- Subject Correct (Physics): ${isSubjectCorrect ? "YES (100%)" : "NO (0%)"} (Value: "${parsed.subject}")`);
      console.log(`- Chapter Correct (Electrostatics): ${isChapterCorrect ? "YES (100%)" : "NO (0%)"} (Value: "${parsed.chapter}")`);
    } catch (e) {
      console.log("\nFailed to parse response as JSON:", e.message);
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`API Call failed after ${(duration / 1000).toFixed(2)} seconds:`, err.message || err);
  }
}

async function main() {
  // 1. Try the requested 550B model with a 15-second timeout (it hangs)
  await testModel("nvidia/nemotron-3-ultra-550b-a55b", true, 15000);

  // 2. Try Llama-3.1-70B-Instruct (which is active and accessible)
  await testModel("meta/llama-3.1-70b-instruct", false, 30000);

  // 3. Try Mistral-Nemotron-12B-Instruct
  await testModel("mistralai/mistral-nemotron", false, 30000);
}

main();
