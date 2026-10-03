import { startEnrichmentWorker } from './enrichmentWorker.js';
import { startIngestionWatchdog } from './watchdog.js';
import { startIngestionWorker } from './ingestionWorker.js';

export function startBackgroundJobs() {
  const stopEnrichment = startEnrichmentWorker().catch((err) => {
    console.error('Failed to start enrichment worker:', err);
    return () => {};
  });
  const stopWatchdog = startIngestionWatchdog();
  const stopIngestion = startIngestionWorker();
  return () => {
    void stopEnrichment.then((stop) => stop?.());
    stopWatchdog?.();
    stopIngestion?.();
  };
}
