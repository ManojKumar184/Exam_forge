import { isProduction } from '../config/env.js';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel = LEVELS[process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')] ?? LEVELS.info;

function log(level, message, meta = {}) {
  if (LEVELS[level] < minLevel) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
