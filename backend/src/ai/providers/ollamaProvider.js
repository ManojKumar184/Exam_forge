import { BaseAIProvider } from './baseProvider.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export class OllamaProvider extends BaseAIProvider {
  constructor() {
    super('ollama');
  }

  isConfigured() {
    return Boolean(env.ai.ollamaBaseUrl);
  }

  async classify(question, catalog, docMeta = {}) {
    if (!this.isConfigured()) return null;

    const prompt = `Return JSON only: class (6-12), difficulty, questionType, subjectHint, topicHint, examTypeHint, confidence 0-1.
Subjects: ${(catalog.subjects || []).map((s) => s.name).join(', ')}
Question: ${(question.questionText || '').slice(0, 1200)}`;

    try {
      const res = await fetch(`${env.ai.ollamaBaseUrl.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.ai.ollamaModel,
          prompt,
          stream: false,
          format: 'json',
        }),
        signal: AbortSignal.timeout(env.ai.requestTimeoutMs),
      });

      if (!res.ok) return null;
      const body = await res.json();
      const parsed = JSON.parse(body.response || '{}');
      return {
        class: parsed.class ? Number(parsed.class) : undefined,
        difficulty: parsed.difficulty,
        questionType: parsed.questionType,
        confidence: Number(parsed.confidence) || 0.45,
        hints: {
          subject: parsed.subjectHint,
          topic: parsed.topicHint,
          examType: parsed.examTypeHint,
        },
      };
    } catch (err) {
      logger.warn('Ollama provider error', { error: err.message });
      return null;
    }
  }
}
