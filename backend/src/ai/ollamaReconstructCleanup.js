import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { semanticQuestionSchema } from '../validators/questionValidators.js';

function extractJSON(str) {
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return str.slice(firstBrace, lastBrace + 1);
  }
  return str;
}

/**
 * Async Local Ollama refinement — replaces geminiReconstructCleanup.
 * Inputs: parserResult, cleanedPlainText.
 */
export async function ollamaReconstructCleanup(parserResult, cleanedPlainText) {
  const baseUrl = (env.ai.ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '');
  const model = env.ai.ollamaModel || 'llama3.2';

  const systemInstruction = `You are a professional educational document parser and question refiner.
Analyze the pre-parsed question structure and raw clean text, repair any minor OCR or formatting errors, identify sub-elements, and output a valid JSON object matching this schema exactly:
{
  "questionType": "MCQ_SINGLE|MCQ_MULTI|INTEGER|NUMERICAL|ASSERTION_REASON|MATCH_COLUMNS|COMPREHENSION|STATEMENT_SET|MATRIX_MATCH|TRUE_FALSE|NESTED_OPTION_MCQ|DESCRIPTIVE|CASE_STUDY",
  "stem": "question text stem only, preserving all MATHPLACEHOLDER<num> tokens exactly",
  "options": [{"text": "option content text, preserving all MATHPLACEHOLDER<num> tokens exactly"}],
  "correctAnswers": ["A", "B", "etc"],
  "explanation": "detailed step-by-step solution / explanation, preserving all MATHPLACEHOLDER<num> tokens exactly",
  "statementGroups": ["statement 1", "statement 2", "etc, preserving all MATHPLACEHOLDER<num> tokens exactly"],
  "formulas": ["MATHPLACEHOLDER0", "etc"],
  "tags": ["topic_tag", "needs_review_tag", "etc"]
}

Guidelines:
1. Fix OCR mistakes and formatting.
2. The text contains math placeholders in the format MATHPLACEHOLDER<number> (e.g., MATHPLACEHOLDER0, MATHPLACEHOLDER1). You MUST preserve these tokens exactly as they are. Never translate them back to mathematical equations, alter their numbers, remove them, or modify them.
3. For probability like P(A) or P(B), do NOT treat A/B as MCQ options.
4. For nested structures (STATEMENT_SET, NESTED_OPTION_MCQ): isolate the statements in 'statementGroups', and place the final option combinations in the 'options' list.
5. Output ONLY valid JSON, with NO markdown code wrappers (like \`\`\`json) or conversational prefix/suffix text.`;

  const prompt = `Refine this question block:
PARSED INPUT:
${JSON.stringify({
  questionText: (parserResult.questionText || '').slice(0, 1500),
  questionType: parserResult.questionType,
  options: (parserResult.options || []).slice(0, 8).map((o) => o.text),
})}

RAW CLEANED TEXT:
${(cleanedPlainText || '').slice(0, 2500)}`;

  // Log 4: Ollama request payload
  logger.info('[FORENSIC_LOG] 4. Ollama request payload', {
    payload: {
      model,
      systemInstruction,
      prompt,
    }
  });

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        system: systemInstruction,
        prompt,
        stream: false,
        format: 'json',
      }),
      signal: AbortSignal.timeout(env.ai.requestTimeoutMs),
    });

    if (!res.ok) {
      logger.warn(`Ollama refinement failed with status ${res.status}`);
      return null;
    }

    const body = await res.json();
    const responseText = body.response || '{}';

    // Log 5: Ollama raw response
    logger.info('[FORENSIC_LOG] 5. Ollama raw response', { rawResponse: responseText });

    let parsed;
    try {
      const cleanedJsonText = extractJSON(responseText.trim());
      parsed = JSON.parse(cleanedJsonText);
      // Log 6: JSON parsing success/failure (success branch)
      logger.info('[FORENSIC_LOG] 6. JSON parsing success', { parsed });
    } catch (parseErr) {
      // Log 6: JSON parsing success/failure (failure branch)
      logger.error('[FORENSIC_LOG] 6. JSON parsing failure', {
        error: parseErr.message,
        rawResponse: responseText
      });
      return null;
    }

    // Log 7: Semantic object generation result
    const validationResult = semanticQuestionSchema.safeParse(parsed);
    if (!validationResult.success) {
      logger.warn('[FORENSIC_LOG] 7. Semantic object validation failure', {
        errors: validationResult.error.errors,
        parsed
      });
      return null;
    }

    logger.info('[FORENSIC_LOG] 7. Semantic object validation success', {
      validated: validationResult.data
    });

    // Normalize validated output
    const validatedData = validationResult.data;
    const finalOptions = validatedData.options.map((o) => {
      if (typeof o === 'string') return { text: o };
      return { text: o.text || '' };
    });
    const finalCorrectAnswers = Array.isArray(validatedData.correctAnswers)
      ? validatedData.correctAnswers
      : [validatedData.correctAnswers].filter(Boolean);

    return {
      ...validatedData,
      options: finalOptions,
      correctAnswers: finalCorrectAnswers,
    };
  } catch (err) {
    logger.warn('Ollama local semantic refinement failed', { error: err.message });
    return null;
  }
}
