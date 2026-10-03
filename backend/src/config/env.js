import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '../..');

// Load backend/.env first, then optional root .env overrides
dotenv.config({ path: path.join(backendRoot, '.env') });
dotenv.config({ path: path.resolve(backendRoot, '..', '.env') });

const requiredInProduction = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

function maskUri(uri) {
  if (!uri) return '(not set)';
  return uri.replace(/:([^:@]+)@/, ':****@');
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI || '',
  nvidiaApiKey: process.env.NVIDIA_API_KEY || '',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || '',
    refreshSecret: process.env.JWT_REFRESH_SECRET || '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS || process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean),
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL,
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD,
  uploadDir: process.env.UPLOAD_DIR || path.join(backendRoot, 'uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 25,
  ai: {
    provider: process.env.AI_PROVIDER || 'nvidia',
    spaceRequestTimeoutMs: Number(process.env.SPACE_REQUEST_TIMEOUT_MS) || 45000,
    spaceColdStartTimeoutMs: Number(process.env.SPACE_COLD_START_TIMEOUT_MS) || 120000,
    requestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS) || 300000,
    // Retry backoff: attempt 1 → 3s, attempt 2 → 10s, attempt 3 → fail
    aiRetryBaseDelayMs: Number(process.env.AI_RETRY_BASE_DELAY_MS) || 3000,
    aiRetryMaxDelayMs: Number(process.env.AI_RETRY_MAX_DELAY_MS) || 10000,
    aiMaxRetries: Number(process.env.AI_MAX_RETRIES) || 3,
    // Prompt budget: target < 3000 chars, absolute max 5000 chars
    promptTargetChars: Number(process.env.AI_PROMPT_TARGET_CHARS) || 3000,
    promptMaxChars: Number(process.env.AI_PROMPT_MAX_CHARS) || 5000,
    // Batch sizing: 10-25 questions per batch, dynamic based on prompt length
    batchMinSize: Number(process.env.AI_BATCH_MIN_SIZE) || 10,
    batchMaxSize: Number(process.env.AI_BATCH_MAX_SIZE) || 25,
    // Concurrency: max parallel AI calls when per-question fallback
    maxConcurrentAiCalls: Number(process.env.AI_MAX_CONCURRENT_CALLS) || 3,
    // Disable batch classification completely and use parallel single questions
    disableBatch: process.env.AI_DISABLE_BATCH === 'true',
    // New config for document‑level workflow
    enableDocClassifyWorkflow: process.env.ENABLE_DOC_CLASSIFY_WORKFLOW === 'true',
    docClassifyBatchMin: Number(process.env.DOC_CLASSIFY_BATCH_MIN) || 10,
    docClassifyBatchMax: Number(process.env.DOC_CLASSIFY_BATCH_MAX) || 50,
    fastNvidiaModels: (process.env.FAST_NVIDIA_MODELS?.split(',') || [
      'deepseek-ai/deepseek-v4-flash',
      'qwen/qwen3-next-80b-a3b-instruct',
      'google/gemma-2-2b-it',
      'mistralai/mistral-nemotron',
      'meta/llama-3.1-8b-instruct'
    ]).map(m=>m.trim()),
    ultraModel: 'nvidia/nemotron-3-ultra-550b-a55b',
  },
  ocr: {
    enabled: process.env.OCR_ENABLED !== 'false',
    maxPdfPages: Number(process.env.OCR_MAX_PDF_PAGES) || 25,
  },
};

export const isProduction = env.nodeEnv === 'production';

export function validateEnv() {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (isProduction && missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (isProduction && env.jwt.accessSecret.length < 32) throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters in production');
  if (isProduction && env.jwt.refreshSecret.length < 32) throw new Error('JWT_REFRESH_SECRET must contain at least 32 characters in production');
  if (isProduction) {
    const match = /^(\d+)(s|m|h|d)$/.exec(env.jwt.accessExpiresIn);
    const factor = { s: 1, m: 60, h: 3600, d: 86400 };
    const accessSeconds = match ? Number(match[1]) * factor[match[2]] : Number.POSITIVE_INFINITY;
    if (accessSeconds > 15 * 60) throw new Error('JWT_ACCESS_EXPIRES_IN must be 15 minutes or shorter in production');
  }
  if (isProduction && env.corsOrigins.some((origin) => !origin.startsWith('https://'))) throw new Error('Production CORS_ORIGINS must contain HTTPS origins only');
  if (isProduction) {
    const secureMongoUri = env.mongodbUri.startsWith('mongodb+srv://') || (env.mongodbUri.startsWith('mongodb://') && /(?:\?|&)tls=true(?:&|$)/i.test(env.mongodbUri));
    const credentialsPresent = /^mongodb(?:\+srv)?:\/\/[^/@:]+:[^/@]+@/i.test(env.mongodbUri);
    if (!secureMongoUri || !credentialsPresent) throw new Error('Production MongoDB must use authenticated TLS (mongodb+srv or mongodb:// with tls=true).');
  }
  if (!env.mongodbUri) {
    throw new Error('MONGODB_URI is required. Set it in backend/.env for MongoDB Atlas.');
  }
  if (!isProduction) {
    for (const key of requiredInProduction) {
      if (!process.env[key]) {
        console.warn(`[config] Warning: ${key} is not set (using dev fallback if available)`);
      }
    }
  }
  if (!env.jwt.accessSecret || !env.jwt.refreshSecret) {
    if (isProduction) {
      throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required in production');
    }
    env.jwt.accessSecret = env.jwt.accessSecret || 'dev-access-secret-change-in-production';
    env.jwt.refreshSecret = env.jwt.refreshSecret || 'dev-refresh-secret-change-in-production';
  }
}

export function logEnvSummary() {
  console.log('[config] Environment loaded');
  console.log(`[config]   NODE_ENV=${env.nodeEnv}`);
  console.log(`[config]   PORT=${env.port}`);
  console.log(`[config]   MONGODB_URI=${maskUri(env.mongodbUri)}`);
  console.log(`[config]   CLIENT_URL=${env.clientUrl}`);
  console.log(`[config]   UPLOAD_DIR=${env.uploadDir}`);
  console.log(`[config]   AI_PROVIDER=${env.ai.provider}`);
  console.log(`[config]   OCR_ENABLED=${env.ocr.enabled}`);
}
