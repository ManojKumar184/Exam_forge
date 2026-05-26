import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Async Local Ollama refinement — replaces geminiReconstructCleanup.
 * Inputs: parserResult, cleanedPlainText.
 */
export async function ollamaReconstructCleanup(parserResult, cleanedPlainText) {
  const baseUrl = (env.ai.ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '');
  const model = env.ai.ollamaModel || 'llama3.2';

  const systemInstruction = `You are a professional educational document parser and question refiner.
Analyze the pre-parsed question structure and raw clean text, repair any minor OCR or formatting errors, standardize the LaTeX mathematical notations, identify sub-elements, and output a valid JSON object matching this schema exactly:
{
  "questionType": "MCQ_SINGLE|MCQ_MULTI|INTEGER|NUMERICAL|ASSERTION_REASON|MATCH_COLUMNS|COMPREHENSION|STATEMENT_SET|MATRIX_MATCH|TRUE_FALSE|NESTED_OPTION_MCQ|DESCRIPTIVE|CASE_STUDY",
  "stem": "question text stem only, preserving $math$ inline and $$math$$ display equations",
  "options": [{"text": "option content text", "latex": null}],
  "correctAnswers": ["A", "B", "etc"],
  "explanation": "detailed step-by-step solution / explanation, with math preserved",
  "statementGroups": ["statement 1", "statement 2", "etc"],
  "formulas": ["\\sqrt{x}", "etc"],
  "tags": ["topic_tag", "needs_review_tag", "etc"]
}

Guidelines:
1. Fix OCR mistakes and formatting. Keep mathematical equations intact.
2. For probability like P(A) or P(B), do NOT treat A/B as MCQ options.
3. For nested structures (STATEMENT_SET, NESTED_OPTION_MCQ): isolate the statements (e.g. statement A, statement B, statement C) in 'statementGroups', and place the final option combinations (e.g. (A) Only A and B, (B) Only B and C) in the 'options' list.
4. Output ONLY valid JSON, with NO markdown code wrappers (like \`\`\`json) or conversational prefix/suffix text.`;

  const prompt = `Refine this question block:
PARSED INPUT:
${JSON.stringify({
  questionText: (parserResult.questionText || '').slice(0, 1500),
  questionType: parserResult.questionType,
  options: (parserResult.options || []).slice(0, 8).map((o) => o.text),
})}

RAW CLEANED TEXT:
${(cleanedPlainText || '').slice(0, 2500)}`;

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
    const parsed = JSON.parse(responseText.trim());
    return parsed;
  } catch (err) {
    logger.warn('Ollama local semantic refinement failed', { error: err.message });
    return null;
  }
}
