// backend/src/ai/providers/nvidiaProvider.js

/**
 * NvidiaProvider – integrates NVIDIA NIM (OpenAI‑compatible) models for classification.
 * It iterates over the fast model list defined in env.fastNvidiaModels, attempts a batch
 * classification, and falls back to the HF Space provider only if all fast models fail.
 * Small prompt‑based cleanup is performed (fix minor OCR/formatting errors) as requested.
 */

import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { BaseAIProvider } from './baseProvider.js';
import { SpaceProvider } from './spaceProvider.js';
import { extractJSON } from './shared.js';

// Helper to build a batch prompt with a tiny‑cleanup instruction.
function buildBatchPrompt(questions, catalog = {}) {
  // Use the same compact syllabus logic as SpaceProvider (we can import if needed)
  // For brevity, we replicate minimal behaviour: include syllabus once via catalog.syllabus if present.
  const parts = [];
  parts.push('You are an educational classification engine.');
  parts.push('');
  parts.push(`Classify ${questions.length} questions.`);
  parts.push('Before classification, fix minor OCR errors, stray characters, or malformed answer labels without changing question meaning.');
  parts.push('');

  questions.forEach((q, idx) => {
    const qText = (q.questionText || '').slice(0, 1200);
    parts.push(`Q${idx + 1}: ${qText}`);
    const options = q.options || [];
    if (options.length > 0) {
      const optText = options.map((o, i) => `${String.fromCharCode(65 + i)}.${(o.text || '').slice(0, 150)}`).join(' ');
      parts.push(`OPTS: ${optText}`);
    }
    const answerText = q.answer || '';
    if (answerText) parts.push(`ANS: ${answerText.slice(0, 200)}`);
    parts.push('---');
  });

  // Add compact syllabus if catalog provides it (reuse SpaceProvider logic if available).
  if (catalog && catalog.syllabus) {
    // Very simple compact representation – list subjects with chapters (truncated).
    const subjects = catalog.syllabus.subjects || [];
    const subjectLines = subjects.slice(0, 3).map(s => `${s.name}: ${((catalog.syllabus.getChildren?.(s._id) || []).filter(c => c.type === 'chapter').map(c => c.name).slice(0, 3)).join(', ')}`);
    if (subjectLines.length) {
      parts.push('SUBJECTS: ' + subjectLines.join(' | '));
      parts.push('');
    }
  }

  parts.push('Use ONLY values from context.');
  parts.push('Return JSON array:');
  parts.push('[{ "class": "", "subject": "", "chapter": "", "topic": "", "difficulty": "" }, ...]');

  return parts.join('\n');
}

export class NvidiaProvider extends BaseAIProvider {
  constructor() {
    super('nvidia_nim');
    this.timeoutMs = Number(env.ai.requestTimeoutMs) || 30000; // per request timeout
    this.models = env.ai.fastNvidiaModels || [];
    this.ultraModel = env.ai.ultraModel;
    this.spaceFallback = new SpaceProvider();
  }

  isConfigured() {
    return !!env.nvidiaApiKey;
  }

  // Internal helper to call NVIDIA endpoint with a specific model and prompt.
  async _callNvidia(model, prompt, timeout) {
    const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.nvidiaApiKey}`,
    };
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.0,
      max_tokens: 1024,
    });
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`NVIDIA API ${res.status}: ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from NVIDIA API');
      return content.trim();
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  // Attempt classification with fast models in order; fallback to SpaceProvider if all fail.
  async classifyBatch(questions, catalog, docMeta = {}) {
    if (!questions?.length) return [];
    const prompt = buildBatchPrompt(questions, catalog);
    const uploadId = docMeta.uploadId || '?';
    const start = Date.now();
    for (const model of this.models) {
      try {
        logger.info(`[NVIDIA] Attempt model=${model} for upload=${uploadId} batchSize=${questions.length}`);
        const response = await this._callNvidia(model, prompt, this.timeoutMs);
        const jsonStr = extractJSON(response);
        const classifications = JSON.parse(jsonStr);
        logger.info(`[NVIDIA] Success model=${model} duration=${Date.now() - start}ms`);
        return classifications.map((c, idx) => ({
          class: c.class,
          difficulty: c.difficulty,
          questionType: questions[idx].questionType,
          hints: { subject: c.subject, topic: c.chapter || c.topic },
        }));
      } catch (err) {
        logger.warn(`[NVIDIA] Model ${model} failed for upload=${uploadId}: ${err.message}`);
        // Continue to next model
      }
    }
    // All fast models failed – fallback to HF Space provider
    logger.info(`[NVIDIA] All fast models failed, falling back to Space provider for upload=${uploadId}`);
    return this.spaceFallback.classifyBatch(questions, catalog, docMeta);
  }
}
