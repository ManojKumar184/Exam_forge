import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import {
  globalApiLimiter,
  authLimiter,
  uploadLimiter,
} from './middleware/rateLimits.js';
import { logger } from './utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env, isProduction, validateEnv, logEnvSummary } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { startBackgroundJobs } from './jobs/index.js';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { csrfProtection } from './middleware/csrfProtection.js';
import { createPrivateUploadRouter } from './middleware/privateUploadRouter.js';
import { REQUIRED_PRODUCTION_MIGRATIONS, findMissingMigrations } from './migrations/productionMigrationPlan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let httpServer = null;
let stopBackgroundJobs = () => {};

async function bootstrap() {
  validateEnv();
  logEnvSummary();

  fs.mkdirSync(env.uploadDir, { recursive: true });
  fs.mkdirSync(path.join(env.uploadDir, 'documents'), { recursive: true });
  fs.mkdirSync(path.join(env.uploadDir, 'images'), { recursive: true });

  await connectDatabase();
  const migrationRecords = await mongoose.connection.db.collection('app_migrations')
    .find({ _id: { $in: REQUIRED_PRODUCTION_MIGRATIONS }, status: 'completed' }).toArray();
  const missingMigrations = findMissingMigrations(REQUIRED_PRODUCTION_MIGRATIONS, migrationRecords);
  if (missingMigrations.length) {
    throw new Error(`Database setup is incomplete. Run "npm run migrate:production --prefix backend" before starting the API. Missing: ${missingMigrations.join(', ')}`);
  }

  stopBackgroundJobs = startBackgroundJobs();

  const app = express();
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    req.id = req.get('x-request-id')?.slice(0, 100) || crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowedOrigins = [...env.corsOrigins, ...(isProduction ? [] : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'])];
        if (allowedOrigins.includes(origin) || (!isProduction && /^http:\/\/localhost:\d+$/.test(origin))) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      exposedHeaders: ['X-CSRF-Token', 'X-Request-Id'],
    })
  );
  app.use(morgan((tokens, req, res) => JSON.stringify({
    ts: new Date().toISOString(),
    requestId: req.id,
    userId: req.user?._id?.toString(),
    institutionId: req.institutionId?.toString(),
    method: tokens.method(req, res),
    path: tokens.url(req, res)?.split('?')[0],
    status: Number(tokens.status(req, res)),
    durationMs: Number(tokens['response-time'](req, res)),
  })));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use('/api', csrfProtection);

  app.use(globalApiLimiter);

  app.use('/uploads', createPrivateUploadRouter(env.uploadDir));

  app.get('/', (_req, res) => {
    res.json({ service: 'examforge-api', status: 'ok' });
  });

  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  httpServer = app.listen(env.port, () => {
    console.log('────────────────────────────────────────');
    console.log(`[server] ExamForge API running`);
    console.log(`[server]   Local:  http://localhost:${env.port}`);
    console.log(`[server]   Health: http://localhost:${env.port}/api/health`);
    console.log(`[server]   CORS:   ${env.clientUrl}`);
    console.log('────────────────────────────────────────');
  });

  setupGracefulShutdown();
}

function setupGracefulShutdown() {
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[server] ${signal} received — shutting down...`);
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      console.log('[server] HTTP server closed');
    }
    stopBackgroundJobs();
    try {
      await disconnectDatabase();
    } catch (err) {
      console.error('[server] Error during DB disconnect:', err.message);
    }
    process.exitCode = 0;
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
  });
}

bootstrap().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  if (err.stack && !isProduction) console.error(err.stack);
  process.exit(1);
});
// Watch-trigger comment for reload: touched at 2026-05-28

