// backend/src/utils/metrics.js

import { logger } from './logger.js';
import { writeFile, readFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MetricsLogger {
  constructor() {
    this.logs = [];
    this.filePath = path.resolve(__dirname, '../../logs/classification_metrics.json');
  }

  async log(data) {
    const entry = {
      timestamp: new Date().toISOString(),
      ...data,
    };
    this.logs.push(entry);
    logger.info(`[METRICS] logged: ${JSON.stringify(entry)}`);

    try {
      // Ensure logs directory exists
      const logsDir = path.dirname(this.filePath);
      await mkdir(logsDir, { recursive: true });
      // Save logs asynchronously to file
      await writeFile(this.filePath, JSON.stringify(this.logs, null, 2), 'utf-8');
    } catch (err) {
      logger.warn(`[METRICS] failed to write to file: ${err.message}`);
    }
  }

  getLogs() {
    return this.logs;
  }
}

export const metricsLogger = new MetricsLogger();
