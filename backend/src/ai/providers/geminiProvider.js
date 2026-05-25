import { BaseAIProvider } from './baseProvider.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Lightweight Gemini classification — single question block only (no PDFs).
 */
export class GeminiProvider extends BaseAIProvider {
  constructor() {
    super('gemini');
  }

  isConfigured() {
    return Boolean(env.ai.geminiApiKey);
  }

  buildQuestionBlockPayload(question) {
    const opts = (question.options || [])
      .map((o, i) => `${String.fromCharCode(65 + i)}. ${o.text || ''}`)
      .join('\n');
    return `STEM:\n${(question.questionText || '').slice(0, 1200)}\nOPTIONS:\n${opts.slice(0, 800)}`;
  }

  async classify(question, catalog, docMeta = {}) {
    if (!this.isConfigured()) return null;

    const subjectList = (catalog.subjects || []).map((s) => s.name).slice(0, 12).join(', ');
    const examList = (catalog.examTypes || []).map((e) => e.name).slice(0, 8).join(', ');
    const topicSample = (catalog.topics || []).map((t) => t.name).slice(0, 20).join(', ');

    const prompt = `You classify Indian JEE/NEET exam questions. Reply JSON only.
{
  "class": 6-12,
  "difficulty": "easy|medium|hard",
  "questionType": "mcq|descriptive|numerical",
  "subtype": "mcq_single|mcq_multiple|integer|numerical|match_following|comprehension|descriptive",
  "subjectHint": "from list",
  "topicHint": "chapter/topic",
  "examTypeHint": "JEE Main|NEET|CBSE etc",
  "confidence": 0-1,
  "validationOk": true,
  "validationNote": ""
}
Rules: if options (a)(b)(c)(d) present → mcq. "one or more correct" → mcq_multiple. integer answer → numerical+integer.
Document class hint: ${docMeta.defaultClass || 11}
Subjects: ${subjectList}
Exam types: ${examList}
Topics sample: ${topicSample}

${this.buildQuestionBlockPayload(question)}`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.ai.geminiModel}:generateContent?key=${env.ai.geminiApiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
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

      const tags = [];
      if (parsed.subtype) tags.push(parsed.subtype);

      return {
        class: parsed.class ? Number(parsed.class) : undefined,
        difficulty: parsed.difficulty,
        questionType: parsed.questionType,
        tags,
        confidence: Number(parsed.confidence) || 0.5,
        validationOk: parsed.validationOk !== false,
        validationNote: parsed.validationNote || null,
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
