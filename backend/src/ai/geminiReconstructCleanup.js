import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { geminiGenerateContent, resolveGeminiModel } from './geminiClient.js';

/**
 * Gemini refinement only — input is already cleaned/parsed; validate and polish.
 */
export async function geminiReconstructCleanup(parserResult, cleanedPlainText) {
  if (!env.ai.geminiApiKey) return null;

  const apiKey = env.ai.geminiApiKey;
  const model = await resolveGeminiModel(apiKey, env.ai.geminiModel);

  const prompt = `You refine a pre-parsed exam question. Do NOT re-parse Office/HTML garbage.
Return JSON only:
{
  "questionText": "stem only, preserve $math$",
  "questionLatex": null,
  "questionType": "mcq|descriptive|numerical",
  "subtype": "mcq_single|mcq_multiple|integer|numerical|match_following|comprehension|descriptive",
  "options": [{"text":"...","latex":null}],
  "tags": [],
  "numericalAnswer": null
}
Rules:
- Fix minor OCR spacing only
- Keep P(A), P(B) probability notation in stem — do NOT treat as MCQ options
- Options must be exactly the four choices if MCQ
- Do not duplicate options
- Preserve fractions as $\\frac{a}{b}$ when needed

PARSED:
${JSON.stringify({
  questionText: (parserResult.questionText || '').slice(0, 1500),
  questionType: parserResult.questionType,
  subtype: parserResult.renderingMetadata?.subtype,
  options: (parserResult.options || []).slice(0, 6).map((o) => o.text),
})}

CLEAN TEXT:
${(cleanedPlainText || '').slice(0, 2500)}`;

  try {
    const result = await geminiGenerateContent({
      apiKey,
      model,
      payload: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1536 },
      },
    });

    if (result.error || !result.res) {
      logger.warn('Gemini reconstruct refine skipped', {
        reason: result.error?.bodyText || result.error?.error || 'unknown',
      });
      return null;
    }

    const body = await result.res.json();
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.warn('Gemini reconstruct refine error', { error: err.message });
    return null;
  }
}
