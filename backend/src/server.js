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
import { env, isProduction, validateEnv, logEnvSummary } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { ensureOllamaReady } from './ai/ollamaSetup.js';
import { startBackgroundJobs } from './jobs/index.js';
import apiRoutes from './routes/index.js';
import { Question } from './models/Question.js';
import { Counter } from './models/Counter.js';
import { SyllabusNode } from './models/SyllabusNode.js';
import { seedSyllabus } from './seedSyllabus.js';
import { migrateSyllabus } from './migrateSyllabus.js';
import { migrateQuestionBanks } from './migrateQuestionBanks.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { seedPredefinedTemplates } from './config/predefinedTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let httpServer = null;

async function bootstrap() {
  validateEnv();
  logEnvSummary();

  fs.mkdirSync(env.uploadDir, { recursive: true });
  fs.mkdirSync(path.join(env.uploadDir, 'documents'), { recursive: true });
  fs.mkdirSync(path.join(env.uploadDir, 'images'), { recursive: true });

  await connectDatabase();
  await seedPredefinedTemplates();
  await migrateQuestionBanks();
  await initializeQuestionSequenceIds();
  await migrateWorkspaceQuestions();

  // Seed syllabus if collection is empty
  try {
    const count = await SyllabusNode.countDocuments();
    if (count === 0) {
      console.log('[server] Syllabus collection is empty. Seeding standard curricula...');
      await seedSyllabus();
      await migrateSyllabus();
    }
  } catch (err) {
    console.error('[server] Failed to run syllabus seeder:', err.message);
  }

  startBackgroundJobs();

  // Asynchronously initialize local Ollama model fallback if configured
  if (env.ai.provider === 'ollama') {
    ensureOllamaReady().catch((err) => {
      logger.error('Failed to initialize local Ollama model', { error: err.message });
    });
  }

  const app = express();
  app.set('trust proxy', 1);

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
        const allowedOrigins = [env.clientUrl, 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];
        if (allowedOrigins.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    })
  );
  app.use(morgan(isProduction ? 'combined' : 'dev'));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(globalApiLimiter);

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

async function initializeQuestionSequenceIds() {
  try {
    const questionsWithoutSeq = await Question.find({ serialId: { $exists: false } }).sort({ createdAt: 1 });
    if (questionsWithoutSeq.length > 0) {
      console.log(`[migration] Found ${questionsWithoutSeq.length} questions without serialId. Migrating...`);
      
      let nextSeq = 1000;
      const counterDoc = await Counter.findOne({ _id: 'questions' });
      if (counterDoc) {
        nextSeq = counterDoc.seq + 1;
      }
      
      for (const q of questionsWithoutSeq) {
        q.serialId = nextSeq;
        await q.save();
        nextSeq++;
      }
      
      await Counter.findOneAndUpdate(
        { _id: 'questions' },
        { seq: nextSeq - 1 },
        { upsert: true }
      );
      
      console.log(`[migration] Successfully migrated questions. Next sequential ID will be Q-${nextSeq}`);
    }
  } catch (err) {
    console.error('[migration] Error migrating question sequence IDs:', err.message);
  }
}

async function migrateWorkspaceQuestions() {
  try {
    const { QuestionBank } = await import('./models/QuestionBank.js');
    const systemBank = await QuestionBank.findOne({ type: 'system', name: 'System Global Bank' });
    
    let sysBankQuery = {};
    if (systemBank) {
      sysBankQuery = { bankIds: systemBank._id };
    } else {
      sysBankQuery = { bankIds: { $exists: true, $not: { $size: 0 } } };
    }

    const res1 = await Question.updateMany(
      {
        ...sysBankQuery,
        $or: [
          { isPrivate: { $ne: false } },
          { visibility: { $ne: 'public' } }
        ]
      },
      {
        $set: { isPrivate: false, visibility: 'public' }
      }
    );
    if (res1.modifiedCount > 0) {
      console.log(`[migration] Updated ${res1.modifiedCount} system global questions to public visibility`);
    }

    const questionsWithoutOwner = await Question.find({ ownerId: null, createdBy: { $ne: null } });
    if (questionsWithoutOwner.length > 0) {
      console.log(`[migration] Found ${questionsWithoutOwner.length} questions without ownerId. Migrating...`);
      for (const q of questionsWithoutOwner) {
        q.ownerId = q.createdBy;
        if (!q.bankIds || q.bankIds.length === 0) {
          q.isPrivate = true;
          q.visibility = 'private';
        }
        await q.save();
      }
      console.log(`[migration] Successfully migrated ownership of ${questionsWithoutOwner.length} questions`);
    }
  } catch (err) {
    console.error('[migration] Error running workspace questions migration:', err.message);
  }
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
    logger.error('Unhandled rejection', { reason: String(reason) });
  });
}

bootstrap().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  if (err.stack && !isProduction) console.error(err.stack);
  process.exit(1);
});
// Watch-trigger comment for reload: touched at 2026-05-28

