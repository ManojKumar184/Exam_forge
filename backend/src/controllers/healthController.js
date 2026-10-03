import { listConfiguredProviders } from '../ai/providerRegistry.js';
import { env } from '../config/env.js';
import mongoose from 'mongoose';

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

export function readiness(_req, res) {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    success: databaseReady,
    data: { service: 'examforge-api', status: databaseReady ? 'ready' : 'not_ready', dependencies: { database: databaseReady ? 'available' : 'unavailable' } },
  });
}
