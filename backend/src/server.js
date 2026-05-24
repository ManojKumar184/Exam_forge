import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { env, isProduction, validateEnv, logEnvSummary } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let httpServer = null;

async function bootstrap() {
  validateEnv();
  logEnvSummary();

  fs.mkdirSync(env.uploadDir, { recursive: true });
  fs.mkdirSync(path.join(env.uploadDir, 'documents'), { recursive: true });
  fs.mkdirSync(path.join(env.uploadDir, 'images'), { recursive: true });

  await connectDatabase();

  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.clientUrl,
      credentials: true,
    })
  );
  app.use(morgan(isProduction ? 'combined' : 'dev'));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.use('/uploads', express.static(env.uploadDir));

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
  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received — shutting down...`);
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      console.log('[server] HTTP server closed');
    }
    try {
      await disconnectDatabase();
    } catch (err) {
      console.error('[server] Error during DB disconnect:', err.message);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled rejection:', reason);
  });
}

bootstrap().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  if (err.stack && !isProduction) console.error(err.stack);
  process.exit(1);
});
