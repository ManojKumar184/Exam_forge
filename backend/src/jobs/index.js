import { startEnrichmentWorker } from './enrichmentWorker.js';
import { startIngestionWatchdog } from './watchdog.js';

export function startBackgroundJobs() {
  startEnrichmentWorker().catch((err) => {
    console.error('Failed to start enrichment worker:', err);
  });
  startIngestionWatchdog();
}
