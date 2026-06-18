import { Upload } from '../models/Upload.js';
import { logger } from '../utils/logger.js';
import { resumeUpload } from '../services/uploadService.js';

const WATCHDOG_INTERVAL_MS = 30000; // 30 seconds
const STALL_TIMEOUT_MS = 60000;    // 60 seconds
// Uploads that have activeProcessing set are actively being worked on.
// Don't launch recovery for them — they may be waiting for AI inference.
const AI_STALL_TIMEOUT_MS = 180000; // 3 minutes for AI inference stalls

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
  const aiCutoffTime = new Date(Date.now() - AI_STALL_TIMEOUT_MS);
  
  // Find uploads currently processing that haven't updated their heartbeat in the appropriate window.
  // Crucial: uploads with activeProcessing.startedAt are actively being worked on.
  // They get a longer timeout because they may be waiting for AI inference.
  const stalled = await Upload.find({
    status: 'processing',
    // Only consider uploads where NO active processing is running, OR
    // the active processing started a very long time ago (>3min for AI)
    $or: [
      // No active processing at all — use normal 60s timeout
      { 
        activeProcessing: null, 
        $or: [
          { lastHeartbeat: { $lt: cutoffTime } },
          { lastHeartbeat: { $exists: false }, updatedAt: { $lt: cutoffTime } }
        ]
      },
      // Has active processing but it started a very long time ago (>3min)
      {
        'activeProcessing.startedAt': { $lt: aiCutoffTime },
      },
    ]
  });

  for (const upload of stalled) {
    const hasActiveProcessing = !!upload.activeProcessing;
    logger.warn(`[watchdog] Stalled upload detected: ${upload._id} in stage '${upload.processingStage}'`, {
      lastHeartbeat: upload.lastHeartbeat,
      activeProcessing: upload.activeProcessing,
      attempts: upload.attempts
    });

    if ((upload.attempts || 0) < 3) {
      try {
        logger.info(`[watchdog] Triggering auto-recovery / resumption for upload ${upload._id} (attempt #${(upload.attempts || 0) + 1})`);
        await resumeUpload(upload._id);
      } catch (err) {
        logger.error(`[watchdog] Failed to trigger resumption for upload ${upload._id}`, { error: err.message });
        try {
          await Upload.updateOne(
            { _id: upload._id },
            {
              $set: {
                status: 'failed',
                progress: 100,
                processingError: `Failed to resume stalled upload: ${err.message}`,
                processingStage: 'failed',
                activeProcessing: null,
              },
              $push: { stageLogs: `[UPLOAD_STAGE] failed - Failed to resume: ${err.message} - ${new Date().toISOString()}` }
            }
          );
        } catch (saveErr) {
          logger.error(`[watchdog] Failed to mark upload ${upload._id} as failed`, { error: saveErr.message });
        }
      }
    } else {
      try {
        await Upload.updateOne(
          { _id: upload._id },
          {
            $set: {
              status: 'failed',
              progress: 100,
              processingError: `Ingestion stalled in stage '${upload.processingStage}' (watchdog timeout, maximum attempts reached)`,
              processingStage: 'failed',
              activeProcessing: null,
            },
            $push: { stageLogs: `[UPLOAD_STAGE] failed - Stalled and exceeded maximum recovery attempts - ${new Date().toISOString()}` }
          }
        );
      } catch (saveErr) {
        logger.error(`[watchdog] Failed to mark upload ${upload._id} as failed`, { error: saveErr.message });
      }
      logger.info(`[watchdog] Stalled upload ${upload._id} marked as failed permanently.`);
    }
  }
}
