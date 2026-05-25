import { BaseAIProvider } from './baseProvider.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export class GeminiProvider extends BaseAIProvider {
  constructor() {
    super('gemini');
  }

  isConfigured() {
    return Boolean(env.ai.geminiApiKey);
  }

  async classify(question, catalog, docMeta = {}) {
    if (!this.isConfigured()) return null;

    const prompt = `Classify exam question as JSON: {"class":6-12,"difficulty":"easy|medium|hard","questionType":"mcq|descriptive|numerical","subjectHint":"","topicHint":"","examTypeHint":"","confidence":0-1}
Class context: ${docMeta.defaultClass || 11}
Subjects: ${(catalog.subjects || []).map((s) => s.name).join(', ')}
Question: ${(question.questionText || '').slice(0, 1500)}`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.ai.geminiModel}:generateContent?key=${env.ai.geminiApiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
        }),
        signal: AbortSignal.timeout(env.ai.requestTimeoutMs),
      });

      if (!res.ok) {
        logger.warn('Gemini classify failed', { status: res.status });
        return null;
      }

      const body = await res.json();
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        class: parsed.class ? Number(parsed.class) : undefined,
        difficulty: parsed.difficulty,
        questionType: parsed.questionType,
        confidence: Number(parsed.confidence) || 0.5,
        hints: {
          subject: parsed.subjectHint,
          topic: parsed.topicHint,
          examType: parsed.examTypeHint,
        },
      };
    } catch (err) {
      logger.warn('Gemini provider error', { error: err.message });
      return null;
    }
  }
}
