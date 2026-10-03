import crypto from 'node:crypto';
import { Upload } from '../models/Upload.js';
import { processQueuedUpload } from '../services/uploadService.js';
import { logger } from '../utils/logger.js';
import { reportError } from '../services/errorReporter.js';

const POLL_MS = 1500;

export async function retryFailedUpload(uploadId, attempts, now = Date.now()) {
  const canRetry = attempts < 3;
  const result = await Upload.updateOne({ _id: uploadId, status: 'failed', activeProcessing: null }, {
    $set: canRetry ? {
      status: 'pending',
      processingError: 'Document processing failed. A bounded retry has been queued.',
      nextAttemptAt: new Date(now + (10_000 * (2 ** Math.max(0, attempts - 1)))),
    } : { processingError: 'Document processing failed after the maximum number of attempts. Retry from the upload review screen.' },
  });
  return { canRetry, updated: result.modifiedCount === 1 };
}

export function startIngestionWorker() {
  let running = false;
  let stopped = false;
  const poll = async () => {
    if (running || stopped) return;
    running = true;
    try {
      while (!stopped) {
        const processingId = crypto.randomUUID();
        const upload = await Upload.findOneAndUpdate(
          { status: 'pending', activeProcessing: null, $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: new Date() } }] },
          { $set: {
            status: 'processing', processingStage: 'parsing', progress: 1,
            activeProcessing: { processingId, startedAt: new Date() }, lastHeartbeat: new Date(),
          }, $unset: { nextAttemptAt: 1 }, $inc: { attempts: 1 } },
          { new: true, sort: { createdAt: 1 } },
        ).populate('uploadedBy');
        if (!upload) break;
        try {
          await processQueuedUpload(upload, processingId);
          const finished = await Upload.findOne({ _id: upload._id, 'activeProcessing.processingId': null }).select('status attempts processingError').lean();
          if (finished?.status === 'failed') {
            void reportError(new Error('Document processing failed'), { code: 'DOCUMENT_PROCESSING_FAILED', jobType: 'document_ingestion' });
            const attempts = upload.attempts || 1;
            const retry = await retryFailedUpload(upload._id, attempts);
            if (retry.canRetry && retry.updated) logger.warn('Document job retry scheduled', { uploadId: upload._id.toString(), attempts });
          }
        } catch (error) {
          logger.error('Durable document job failed', { uploadId: upload._id.toString(), errorName: error.name });
          void reportError(error, { code: 'DOCUMENT_PROCESSING_FAILED', jobType: 'document_ingestion' });
          const canRetry = (upload.attempts || 1) < 3;
          await Upload.updateOne({ _id: upload._id, status: { $in: ['processing', 'failed'] }, 'activeProcessing.processingId': processingId }, {
            $set: {
              status: canRetry ? 'pending' : 'failed', processingStage: canRetry ? 'parsing' : 'failed', progress: canRetry ? upload.progress : 100,
              processingError: canRetry ? 'Document processing failed. A bounded retry has been queued.' : 'Document processing failed after the maximum number of attempts. Retry from the upload review screen.',
              activeProcessing: null, lastHeartbeat: new Date(),
              ...(canRetry ? { nextAttemptAt: new Date(Date.now() + (10_000 * (2 ** Math.max(0, (upload.attempts || 1) - 1)))) } : {}),
            },
          });
        }
      }
    } catch (error) {
      logger.error('Document queue polling failed', { error: error.message });
    } finally {
      running = false;
    }
  };
  void poll();
  const timer = setInterval(() => void poll(), POLL_MS);
  timer.unref?.();
  logger.info('MongoDB-backed document ingestion worker started');
  return () => { stopped = true; clearInterval(timer); };
}
