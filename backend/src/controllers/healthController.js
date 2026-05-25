import { listConfiguredProviders } from '../ai/providerRegistry.js';
import { env } from '../config/env.js';

export function health(req, res) {
  res.json({
    success: true,
    data: {
      service: 'examforge-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      ocr: { enabled: env.ocr.enabled },
      ai: {
        provider: env.ai.provider,
        configured: listConfiguredProviders(),
      },
    },
  });
}
