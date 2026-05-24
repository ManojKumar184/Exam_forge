import mongoose from 'mongoose';
import { env } from './env.js';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

let listenersRegistered = false;

function registerConnectionListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('connected', () => {
    console.log('[db] Mongoose connected to MongoDB');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] Mongoose connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] Mongoose disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[db] Mongoose reconnected');
  });
}

function atlasConnectionOptions() {
  return {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    retryWrites: true,
    w: 'majority',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  registerConnectionListeners();

  if (mongoose.connection.readyState === 1) {
    console.log('[db] Already connected');
    return mongoose.connection;
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[db] Connecting to MongoDB (attempt ${attempt}/${MAX_RETRIES})...`);
      await mongoose.connect(env.mongodbUri, atlasConnectionOptions());
      const { host, name } = mongoose.connection;
      console.log(`[db] Ready — database: ${name} @ ${host}`);
      return mongoose.connection;
    } catch (err) {
      lastError = err;
      console.error(`[db] Connection failed (attempt ${attempt}):`, err.message);
      if (attempt < MAX_RETRIES) {
        console.log(`[db] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(
    `Could not connect to MongoDB after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  console.log('[db] Connection closed gracefully');
}
