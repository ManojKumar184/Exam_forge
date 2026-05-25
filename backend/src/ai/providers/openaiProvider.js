import { BaseAIProvider } from './baseProvider.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export class OpenAIProvider extends BaseAIProvider {
  constructor() {
    super('openai');
  }

  isConfigured() {
    return Boolean(env.ai.openaiApiKey);
  }

  async classify(question, catalog, docMeta = {}) {
    if (!this.isConfigured()) return null;

    const subjects = (catalog.subjects || []).map((s) => s.name).join(', ');
    const exams = (catalog.examTypes || []).map((e) => e.name).join(', ');
    const topics = (catalog.topics || [])
      .slice(0, 40)
      .map((t) => t.name)
      .join(', ');

    const prompt = `Classify this exam question. Reply JSON only with keys: class (6-12), difficulty (easy|medium|hard), questionType (mcq|descriptive|numerical), subjectHint, topicHint, examTypeHint, confidence (0-1).
Subjects: ${subjects}
Exam types: ${exams}
Topics sample: ${topics}
Document class hint: ${docMeta.defaultClass || 'unknown'}
Question: ${(question.questionText || '').slice(0, 1500)}`;

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.ai.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env.ai.openaiModel,
          messages: [
            { role: 'system', content: 'You classify Indian exam questions. Output valid JSON only.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 400,
        }),
        signal: AbortSignal.timeout(env.ai.requestTimeoutMs),
      });

      if (!res.ok) {
        logger.warn('OpenAI classify failed', { status: res.status });
        return null;
      }

      const body = await res.json();
      const content = body.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        class: parsed.class ? Number(parsed.class) : undefined,
        difficulty: parsed.difficulty,
        questionType: parsed.questionType,
        tags: parsed.topicHint ? [parsed.topicHint] : [],
        confidence: Number(parsed.confidence) || 0.5,
        reasoning: parsed.subjectHint || null,
        hints: {
          subject: parsed.subjectHint,
          topic: parsed.topicHint,
          examType: parsed.examTypeHint,
        },
      };
    } catch (err) {
      logger.warn('OpenAI provider error', { error: err.message });
      return null;
    }
  }
}
