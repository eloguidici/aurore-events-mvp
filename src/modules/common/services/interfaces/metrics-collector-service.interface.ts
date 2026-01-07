/**
 * Interface for Metrics Collector Service
 * Defines the contract for collecting and aggregating system metrics
 */
export interface IMetricsCollectorService {
  /**
   * Record buffer enqueue event
   * Called when an event is successfully added to the buffer
   */
  recordBufferEnqueue(): void;

  /**
   * Record buffer drop event (backpressure)
   * Called when buffer is full and event is rejected
   */
  recordBufferDrop(): void;

  /**
   * Record buffer drain event
   * Called when events are extracted from buffer for processing
   */
  recordBufferDrain(): void;

  /**
   * Record batch processing completion
   * Tracks batch processing performance metrics
   *
   * @param batchSize - Number of events processed in this batch
   * @param processingTimeMs - Total time taken to process the batch (milliseconds)
   * @param insertTimeMs - Time taken to insert events to database (milliseconds)
   */
  recordBatchProcessed(
    batchSize: number,
    processingTimeMs: number,
    insertTimeMs: number,
  ): void;

  /**
   * Get buffer metrics snapshot
   * Returns a copy of current buffer metrics
   *
   * @returns Snapshot of buffer metrics
   */
  getBufferMetrics(): {
    totalEnqueued: number;
    totalDropped: number;
    startTime: number;
    lastEnqueueTime: number;
    lastDrainTime: number;
  };

  /**
   * Get batch worker metrics snapshot
   * Returns a copy of current batch worker metrics
   *
   * @returns Snapshot of batch worker metrics
   */
  getBatchWorkerMetrics(): {
    totalBatchesProcessed: number;
    totalEventsProcessed: number;
    totalInsertTimeMs: number;
    averageBatchProcessingTimeMs: number;
  };

  /**
   * Reset all metrics (useful for testing)
   * Resets counters and timestamps to initial state
   */
  reset(): void;
}

