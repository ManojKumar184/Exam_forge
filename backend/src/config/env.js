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
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || '',
    refreshSecret: process.env.JWT_REFRESH_SECRET || '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL,
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD,
  uploadDir: process.env.UPLOAD_DIR || path.join(backendRoot, 'uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 25,
};

export const isProduction = env.nodeEnv === 'production';

export function validateEnv() {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (isProduction && missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
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
}
