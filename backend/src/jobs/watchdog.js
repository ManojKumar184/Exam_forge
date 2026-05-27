import { Upload } from '../models/Upload.js';
import { logger } from '../utils/logger.js';

const WATCHDOG_INTERVAL_MS = 30000; // 30 seconds
const STALL_TIMEOUT_MS = 60000;    // 60 seconds

export function startIngestionWatchdog() {
  logger.info('[watchdog] Ingestion watchdog started.');
  
  setInterval(async () => {
    try {
      await checkStalledUploads();
    } catch (err) {
      logger.error('[watchdog] Error checking stalled uploads', { error: err.message });
    }
  }, WATCHDOG_INTERVAL_MS);
}

async function checkStalledUploads() {
  const cutoffTime = new Date(Date.now() - STALL_TIMEOUT_MS);
  
  // Find uploads currently processing that haven't updated their heartbeat/updatedAt in 60s
  const stalled = await Upload.find({
    status: 'processing',
    $or: [
      { lastHeartbeat: { $lt: cutoffTime } },
      { lastHeartbeat: { $exists: false }, updatedAt: { $lt: cutoffTime } }
    ]
  });

  for (const upload of stalled) {
    logger.warn(`[watchdog] Stalled upload detected: ${upload._id} in stage '${upload.processingStage}'`, {
      lastHeartbeat: upload.lastHeartbeat,
      updatedAt: upload.updatedAt
    });

    upload.status = 'failed';
    upload.progress = 100;
    upload.processingError = `Ingestion stalled in stage '${upload.processingStage}' (watchdog timeout)`;
    upload.processingStage = 'failed';
    upload.stageLogs.push(`[UPLOAD_STAGE] failed - Stalled in stage '${upload.processingStage}' > ${STALL_TIMEOUT_MS / 1000}s - ${new Date().toISOString()}`);
    
    await upload.save();
    logger.info(`[watchdog] Stalled upload ${upload._id} marked as failed.`);
  }
}
