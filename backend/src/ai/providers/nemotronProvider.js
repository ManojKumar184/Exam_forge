import { BaseAIProvider } from './baseProvider.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { normalizeQuestionType } from '../../utils/questionTypeNormalizer.js';
import { extractJSON, extractAnswer } from './shared.js';

const NEMOTRON_HOST = 'https://integrate.api.nvidia.com/v1';
const NEMOTRON_ENDPOINT = '/chat/completions';

export class NemotronProvider extends BaseAIProvider {
  constructor() {
    super('nemotron');
    this.timeoutMs = Number(env.ai.spaceRequestTimeoutMs) || 45000;
    this.maxRetries = Number(env.ai.aiMaxRetries) || 3;
    this.baseDelayMs = Number(env.ai.aiRetryBaseDelayMs) || 3000;
    this.maxDelayMs = Number(env.ai.aiRetryMaxDelayMs) || 10000;
  }

  isConfigured() {
    return Boolean(env.nvidiaApiKey || process.env.NVIDIA_API_KEY);
  }

  async _withRetry(fn, label = '') {
    let lastError = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn(this.timeoutMs);
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          const delay = Math.min(this.baseDelayMs * Math.pow(2, attempt - 1), this.maxDelayMs);
          logger.info(`[nemotron] Retry ${attempt + 1}/${this.maxRetries} for ${label} after ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  async _callNemotron(prompt, timeout = this.timeoutMs) {
    const url = `${NEMOTRON_HOST}${NEMOTRON_ENDPOINT}`;
    const apiKey = env.nvidiaApiKey || process.env.NVIDIA_API_KEY;
    const callStart = Date.now();

    if (!apiKey) {
      throw new Error('NVIDIA_API_KEY is not configured');
    }

    const payload = {
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      top_p: 0.95,
      max_tokens: 1024,
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      throw new Error(`Nemotron API call failed: ${err.name} — ${err.message}`);
    }

    const callDuration = Date.now() - callStart;

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Nemotron API returned ${res.status}: ${errBody.slice(0, 200)}`);
    }

    let bodyJson;
    try {
      bodyJson = await res.json();
    } catch (err) {
      throw new Error(`Nemotron API response not JSON: ${err.message}`);
    }

    if (!bodyJson || !bodyJson.choices || bodyJson.choices.length === 0) {
      throw new Error('Nemotron API response missing choices array');
    }

    const responseText = bodyJson.choices[0]?.message?.content;
    if (typeof responseText !== 'string' || !responseText.trim()) {
      throw new Error('Nemotron API returned empty or non-string response');
    }

    logger.info(`[NEMOTRON_CALL] Status=ok Duration=${callDuration}ms Output_size=${responseText.length}`);
    return responseText.trim();
  }

  _buildPrompt(question, catalog = {}) {
    const parts = [];
    parts.push('You are an educational classification engine.');
    parts.push('');
    parts.push('QUESTION:');
    parts.push((question.questionText || '').slice(0, 2000));

    const options = question.options || [];
    if (options.length > 0) {
      const optLines = options.map((o, i) =>
        `${String.fromCharCode(65 + i)}. ${(o.text || '').slice(0, 200)}`
      );
      parts.push('OPTIONS: ' + optLines.join(' | '));
    }

    const answerText = extractAnswer(question);
    if (answerText) {
      parts.push('ANSWER: ' + answerText.slice(0, 300));
    }

    if (question.explanation) {
      parts.push('EXPL: ' + question.explanation.slice(0, 300));
    }

    parts.push('');
    parts.push('Return ONLY valid JSON with classification hints:');
    parts.push('{"class":"","subject":"","chapter":"","topic":"","difficulty":""}');

    return parts.join('\n');
  }

  async classify(question, catalog, docMeta = {}) {
    if (!this.isConfigured()) return null;

    const prompt = this._buildPrompt(question, catalog);
    const uploadId = docMeta?.uploadId || '?';

    let responseText;
    try {
      responseText = await this._withRetry(
        (timeout) => this._callNemotron(prompt, timeout),
        `single-${uploadId}`
      );
    } catch (err) {
      logger.error(`[NEMOTRON_RESULT] Upload=${uploadId} Status=fail Error=${err.message}`);
      return null;
    }

    try {
      const jsonStr = extractJSON(responseText);
      const classification = JSON.parse(jsonStr);

      if (!classification.class && !classification.subject) {
        return null;
      }

      const classStr = String(classification.class || '');
      const classNum = parseInt(classStr.replace(/[^0-9]/g, ''), 10) || undefined;
      const difficulty = (classification.difficulty || 'medium').toLowerCase();

      return {
        class: (classNum >= 6 && classNum <= 12) ? classNum : undefined,
        difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
        questionType: normalizeQuestionType(question.questionType || ''),
        confidence: 0.85, // Set higher baseline confidence for Ultra
        hints: {
          subject: classification.subject || null,
          topic: classification.chapter || classification.topic || null,
          examType: null,
        },
      };
    } catch (err) {
      logger.warn(`[nemotron] Parse response failed: ${err.message}`);
      return null;
    }
  }
}
