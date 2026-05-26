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

    const subjectsList = (catalog?.subjects || []).map((s) => s.name).join(', ') || 'Physics, Chemistry, Mathematics, Biology';
    
    const systemInstruction = `You are a professional educational document parser and question classifier.
You MUST analyze the input question and classify it according to standard Indian educational curricula (JEE, NEET, CBSE).
You MUST return a raw JSON object matching this schema exactly:
{
  "class": number, // an integer from 6 to 12
  "difficulty": string, // "easy", "medium", or "hard"
  "questionType": string, // "mcq", "numerical", or "descriptive"
  "subjectHint": string, // One of the allowed subjects: ${subjectsList}
  "topicHint": string, // Specific chapter or topic name (e.g. "Probability", "Electrostatics")
  "examTypeHint": string, // "JEE", "NEET", "CBSE", or "School Exam"
  "confidence": number // float between 0.0 and 1.0
}
DO NOT wrap the response in markdown blocks or include any extra commentary. Output ONLY valid JSON.`;

    const prompt = `Classify this question:
Question Text:
${question.questionText || ''}

Options:
${(question.options || []).map((o, idx) => `${String.fromCharCode(65 + idx)}. ${o.text}`).join('\n')}

Additional Context:
${JSON.stringify(docMeta)}`;

    try {
      const res = await fetch(`${env.ai.ollamaBaseUrl.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.ai.ollamaModel,
          system: systemInstruction,
          prompt,
          stream: false,
          format: 'json',
        }),
        signal: AbortSignal.timeout(env.ai.requestTimeoutMs),
      });

      if (!res.ok) {
        logger.warn(`Ollama classification failed with status ${res.status}`);
        return null;
      }
      
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
      logger.warn('Ollama provider classification error', { error: err.message });
      return null;
    }
  }
}
