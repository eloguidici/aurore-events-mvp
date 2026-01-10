/**
 * Batch worker configuration interface
 */
export interface BatchWorkerConfig {
  batchSize: number;
  drainInterval: number;
  maxRetries: number;
  maxBatchSize: number;
}
