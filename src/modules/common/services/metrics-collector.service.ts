import { Injectable, Logger } from '@nestjs/common';

import { IMetricsCollectorService } from './interfaces/metrics-collector-service.interface';

/**
 * Centralized metrics collection service
 * Separates metrics tracking from business logic
 *
 * Services notify metric events instead of managing their own metrics state.
 * This service aggregates and exposes all metrics, keeping business logic clean.
 */
@Injectable()
export class MetricsCollectorService implements IMetricsCollectorService {
  private readonly logger = new Logger(MetricsCollectorService.name);

  // Buffer metrics - tracks buffer operations
  private readonly bufferMetrics = {
    totalEnqueued: 0,
    totalDropped: 0,
    startTime: Date.now(), // Service start time for uptime calculation
    lastEnqueueTime: 0,
    lastDrainTime: 0,
  };

  // Batch worker metrics - tracks batch processing performance
  private readonly batchWorkerMetrics = {
    totalBatchesProcessed: 0,
    totalEventsProcessed: 0,
    totalInsertTimeMs: 0,
    averageBatchProcessingTimeMs: 0,
  };

  /**
   * Record buffer enqueue event
   * Called when an event is successfully added to the buffer
   */
  recordBufferEnqueue(): void {
    this.bufferMetrics.totalEnqueued++;
    this.bufferMetrics.lastEnqueueTime = Date.now();
  }

  /**
   * Record buffer drop event (backpressure)
   * Called when buffer is full and event is rejected
   */
  recordBufferDrop(): void {
    this.bufferMetrics.totalDropped++;
  }

  /**
   * Record buffer drain event
   * Called when events are extracted from buffer for processing
   */
  recordBufferDrain(): void {
    this.bufferMetrics.lastDrainTime = Date.now();
  }

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
  ): void {
    this.batchWorkerMetrics.totalBatchesProcessed++;
    this.batchWorkerMetrics.totalEventsProcessed += batchSize;
    this.batchWorkerMetrics.totalInsertTimeMs += insertTimeMs;

    // Update rolling average of batch processing time
    this.batchWorkerMetrics.averageBatchProcessingTimeMs =
      (this.batchWorkerMetrics.averageBatchProcessingTimeMs *
        (this.batchWorkerMetrics.totalBatchesProcessed - 1) +
        processingTimeMs) /
      this.batchWorkerMetrics.totalBatchesProcessed;

    // Log performance metrics periodically (every 100 batches)
    if (this.batchWorkerMetrics.totalBatchesProcessed % 100 === 0) {
      const avgInsertTime =
        this.batchWorkerMetrics.totalInsertTimeMs /
        this.batchWorkerMetrics.totalBatchesProcessed;

      this.logger.log(
        `Performance metrics: avg batch time=${this.batchWorkerMetrics.averageBatchProcessingTimeMs.toFixed(2)}ms, ` +
          `avg insert=${avgInsertTime.toFixed(2)}ms`,
      );
    }
  }

  /**
   * Get buffer metrics snapshot
   * Returns a copy of current buffer metrics
   *
   * @returns Snapshot of buffer metrics
   */
  getBufferMetrics() {
    return {
      totalEnqueued: this.bufferMetrics.totalEnqueued,
      totalDropped: this.bufferMetrics.totalDropped,
      startTime: this.bufferMetrics.startTime,
      lastEnqueueTime: this.bufferMetrics.lastEnqueueTime,
      lastDrainTime: this.bufferMetrics.lastDrainTime,
    };
  }

  /**
   * Get batch worker metrics snapshot
   * Returns a copy of current batch worker metrics
   *
   * @returns Snapshot of batch worker metrics
   */
  getBatchWorkerMetrics() {
    return {
      totalBatchesProcessed: this.batchWorkerMetrics.totalBatchesProcessed,
      totalEventsProcessed: this.batchWorkerMetrics.totalEventsProcessed,
      totalInsertTimeMs: this.batchWorkerMetrics.totalInsertTimeMs,
      averageBatchProcessingTimeMs:
        this.batchWorkerMetrics.averageBatchProcessingTimeMs,
    };
  }

  /**
   * Reset all metrics (useful for testing)
   * Resets counters and timestamps to initial state
   */
  reset(): void {
    this.bufferMetrics.totalEnqueued = 0;
    this.bufferMetrics.totalDropped = 0;
    this.bufferMetrics.startTime = Date.now();
    this.bufferMetrics.lastEnqueueTime = 0;
    this.bufferMetrics.lastDrainTime = 0;

    this.batchWorkerMetrics.totalBatchesProcessed = 0;
    this.batchWorkerMetrics.totalEventsProcessed = 0;
    this.batchWorkerMetrics.totalInsertTimeMs = 0;
    this.batchWorkerMetrics.averageBatchProcessingTimeMs = 0;
  }
}
