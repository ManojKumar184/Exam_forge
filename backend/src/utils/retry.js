import { logger } from './logger.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry async work with exponential backoff.
 */
export async function retryAsync(fn, options = {}) {
  const { retries = 2, baseDelayMs = 400, label = 'operation' } = options;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = baseDelayMs * 2 ** attempt;
        logger.warn(`${label} failed, retrying`, {
          attempt: attempt + 1,
          delayMs: delay,
          error: err.message,
        });
        await sleep(delay);
      }
    }
  }
  throw lastError;
}
