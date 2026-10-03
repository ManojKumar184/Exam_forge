import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/** Send low-cardinality, non-content error events to a configured HTTPS collector. */
export async function reportError(error, context = {}) {
  if (env.errorReporting.provider !== 'http') return false;
  const payload = {
    event: 'examforge.error',
    timestamp: new Date().toISOString(),
    errorName: String(error?.name || 'Error').slice(0, 100),
    errorCode: String(context.code || error?.code || 'UNCLASSIFIED').slice(0, 100),
    requestId: context.requestId ? String(context.requestId).slice(0, 100) : undefined,
    route: context.route ? String(context.route).split('?')[0].slice(0, 200) : undefined,
    method: context.method ? String(context.method).slice(0, 12) : undefined,
    statusCode: Number.isInteger(context.statusCode) ? context.statusCode : undefined,
    jobType: context.jobType ? String(context.jobType).slice(0, 80) : undefined,
  };
  try {
    const response = await fetch(env.errorReporting.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.errorReporting.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) logger.warn('External error reporting request failed', { statusCode: response.status });
    return response.ok;
  } catch (reportingError) {
    logger.warn('External error reporting unavailable', { errorName: reportingError.name });
    return false;
  }
}
