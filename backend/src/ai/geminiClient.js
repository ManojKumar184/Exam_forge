import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/** Models to try when GEMINI_MODEL is missing or returns 404 (Google rotates aliases). */
const FLASH_MODEL_CHAIN = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-002',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
];

let cachedModelId = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

function uniqueModels(preferred) {
  const list = [preferred, ...FLASH_MODEL_CHAIN, env.ai.geminiModel].filter(Boolean);
  return [...new Set(list.map((m) => m.replace(/^models\//, '')))];
}

async function readErrorBody(res) {
  try {
    const text = await res.text();
    if (!text) return '(empty body)';
    try {
      const json = JSON.parse(text);
      return JSON.stringify(json);
    } catch {
      return text.slice(0, 2000);
    }
  } catch {
    return '(could not read body)';
  }
}

/**
 * List models that support generateContent for this API key.
 */
export async function listGeminiModels(apiKey) {
  const versions = ['v1beta', 'v1'];
  for (const version of versions) {
    try {
      const url = `https://generativelanguage.googleapis.com/${version}/models?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const body = await res.json();
      return (body.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => (m.name || '').replace(/^models\//, ''))
        .filter(Boolean);
    } catch (err) {
      logger.warn('Gemini listModels failed', { version, error: err.message });
    }
  }
  return [];
}

/**
 * Pick first model from preferred chain that exists in ListModels (or try generate).
 */
export async function resolveGeminiModel(apiKey, preferred = env.ai.geminiModel) {
  if (cachedModelId && Date.now() < cacheExpiresAt) return cachedModelId;

  const available = await listGeminiModels(apiKey);
  const candidates = uniqueModels(preferred);

  if (available.length) {
    for (const id of candidates) {
      if (available.includes(id)) {
        cachedModelId = id;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        if (id !== preferred) {
          logger.info('Gemini model fallback', { requested: preferred, using: id });
        }
        return id;
      }
    }
    const flash = available.find((m) => /flash/i.test(m));
    if (flash) {
      cachedModelId = flash;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      logger.info('Gemini model auto-selected from catalog', { using: flash });
      return flash;
    }
  }

  cachedModelId = candidates[0] || 'gemini-2.0-flash';
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  logger.warn('Gemini ListModels empty or failed; using configured guess', {
    using: cachedModelId,
  });
  return cachedModelId;
}

/**
 * REST generateContent with header auth + model chain on 404.
 */
export async function geminiGenerateContent({ apiKey, model, payload }) {
  const models = uniqueModels(model);
  const versions = ['v1beta', 'v1'];
  let lastError = null;

  for (const modelId of models) {
    for (const version of versions) {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${modelId}:generateContent`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(env.ai.requestTimeoutMs),
        });

        if (res.ok) {
          if (modelId !== model) {
            logger.info('Gemini generateContent succeeded with fallback model', {
              requested: model,
              used: modelId,
              apiVersion: version,
            });
          }
          cachedModelId = modelId;
          cacheExpiresAt = Date.now() + CACHE_TTL_MS;
          return { res, modelId, apiVersion: version };
        }

        const bodyText = await readErrorBody(res);
        lastError = { status: res.status, modelId, version, bodyText };

        if (res.status === 404) {
          logger.warn('Gemini classify failed (model not found)', {
            status: res.status,
            model: modelId,
            apiVersion: version,
            responseBody: bodyText,
          });
          continue;
        }

        logger.warn('Gemini classify failed', {
          status: res.status,
          model: modelId,
          apiVersion: version,
          responseBody: bodyText,
        });
        return { error: lastError };
      } catch (err) {
        lastError = { error: err.message, modelId, version };
        logger.warn('Gemini request error', { model: modelId, error: err.message });
      }
    }
  }

  return { error: lastError };
}
