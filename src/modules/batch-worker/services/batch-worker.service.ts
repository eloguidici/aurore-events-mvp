import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { randomBytes } from 'crypto';

import { ErrorLogger } from '../../common/utils/error-logger';
import { envs } from '../../config/envs';
import { EnrichedEvent } from '../../event/interfaces/enriched-event.interface';
import { EventBufferService } from '../../event/services/event-buffer.service';
import { EventService } from '../../event/services/events.service';

@Injectable()
export class BatchWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BatchWorkerService.name);
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  private readonly batchSize: number;
  private readonly drainInterval: number; // milliseconds
  private readonly maxRetries: number;

  // Performance metrics
  private readonly performanceMetrics = {
    totalBatchesProcessed: 0,
    totalEventsProcessed: 0,
    totalInsertTimeMs: 0,
    averageBatchProcessingTimeMs: 0,
  };

  constructor(
    private readonly eventBufferService: EventBufferService,
    private readonly eventService: EventService,
  ) {
    this.batchSize = envs.batchSize;
    this.drainInterval = envs.drainInterval;
    this.maxRetries = envs.maxRetries;
  }

  /**
   * Start batch worker when module initializes
   */
  onModuleInit() {
    this.start();
  }

  /**
   * Stop batch worker and process remaining events when module is destroyed
   */
  async onModuleDestroy() {
    await this.stop();
  }

  /**
   * Start the batch worker
   * Begins processing batches at configured intervals
   */
  public start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.logger.log(
      `Batch worker started (batch_size=${this.batchSize}, interval=${this.drainInterval}ms)`,
    );

    // Process batches at regular intervals
    this.intervalId = setInterval(() => {
      this.process().catch((error) => {
        ErrorLogger.logError(this.logger, 'Batch processing error', error);
      });
    }, this.drainInterval);
  }

  /**
   * Stop the batch worker
   * Processes ALL remaining events in buffer before stopping
   * Implements graceful shutdown with timeout protection
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Process ALL remaining events in buffer before stopping
    const SHUTDOWN_TIMEOUT_MS = envs.shutdownTimeoutMs;
    const startTime = Date.now();
    let batchCount = 0;

    while (this.eventBufferService.getSize() > 0) {
      // Check timeout to prevent infinite loop
      if (Date.now() - startTime > SHUTDOWN_TIMEOUT_MS) {
        ErrorLogger.logWarning(this.logger, 'Shutdown timeout reached', {
          timeoutMs: SHUTDOWN_TIMEOUT_MS,
          remainingEvents: this.eventBufferService.getSize(),
        });
        break;
      }

      try {
        await this.process();
        batchCount++;

        // Small delay to allow other operations (like checkpoint) to run
        await new Promise((resolve) => setImmediate(resolve));
      } catch (error) {
        ErrorLogger.logError(
          this.logger,
          'Error processing batch during shutdown',
          error,
          { remainingEvents: this.eventBufferService.getSize() },
        );
        // Continue processing remaining events despite error
      }
    }

    if (batchCount > 0) {
      this.logger.log(
        `Batch worker stopped after processing ${batchCount} final batches`,
      );
    } else {
      this.logger.log('Batch worker stopped (no events to process)');
    }
  }

  /**
   * Process a batch of events from the buffer
   * Drains buffer, validates events, inserts to database, and handles retries
   */
  private async process() {
    const batchStartTime = Date.now();
    let batch: EnrichedEvent[] = [];

    try {
      // Drain buffer (with validation of batch size to prevent memory issues)
      const requestedBatchSize = Math.min(
        this.batchSize,
        10000, // Hard limit to prevent memory issues
      );
      batch = this.eventBufferService.drain(requestedBatchSize);

      if (batch.length === 0) {
        return; // Buffer is empty
      }

      this.logger.debug(`Processing batch of ${batch.length} events`);

      // All events are already validated:
      // - New events: validated by ValidationPipe before entering buffer
      // - Checkpoint events: validated when loaded from disk
      // - Retry events: validated in previous batch before re-enqueue
      // No need to validate again here

      // Insert events to storage
      // Pass EnrichedEvent[] directly to preserve eventId
      if (batch.length > 0) {
        const insertStartTime = Date.now();
        const { successful, failed } =
          await this.eventService.insert(batch);
        const insertTimeMs = Date.now() - insertStartTime;
        this.performanceMetrics.totalInsertTimeMs += insertTimeMs;

        if (failed > 0) {
          ErrorLogger.logWarning(this.logger, 'Failed to insert events', {
            failedCount: failed,
            successfulCount: successful,
            totalAttempted: batch.length,
          });

          // Retry failed events (up to maxRetries)
          // Note: insert doesn't specify which events failed, so we retry
          // all events that were attempted. This is conservative but safe.
          // In a production system, insert should return which specific events failed.
          await this.retryFailed(batch);
        }

        if (successful > 0) {
          this.logger.debug(`Successfully inserted ${successful} events`);
        }
      }

      // Update performance metrics
      const batchProcessingTimeMs = Date.now() - batchStartTime;
      this.performanceMetrics.totalBatchesProcessed++;
      this.performanceMetrics.totalEventsProcessed += batch.length;
      this.performanceMetrics.averageBatchProcessingTimeMs =
        (this.performanceMetrics.averageBatchProcessingTimeMs *
          (this.performanceMetrics.totalBatchesProcessed - 1) +
          batchProcessingTimeMs) /
        this.performanceMetrics.totalBatchesProcessed;

      // Log performance metrics periodically (every 100 batches)
      if (this.performanceMetrics.totalBatchesProcessed % 100 === 0) {
        this.logger.log(
          `Performance metrics: avg batch time=${this.performanceMetrics.averageBatchProcessingTimeMs.toFixed(2)}ms, ` +
            `avg insert=${(this.performanceMetrics.totalInsertTimeMs / this.performanceMetrics.totalBatchesProcessed).toFixed(2)}ms`,
        );
      }
    } catch (error) {
      // Log error with standardized format - worker should continue processing
      ErrorLogger.logError(this.logger, 'Error processing batch', error, {
        batchSize: batch.length,
      });
      // Worker continues - next batch will be processed
    }
  }

  /**
   * Retry failed events by re-enqueuing them to the buffer
   * Events are re-enqueued immediately (non-blocking)
   * The buffer naturally spaces out retries through batch processing intervals
   *
   * @param failedEvents - Array of events that failed to insert
   */
  private async retryFailed(failedEvents: EnrichedEvent[]) {
    if (failedEvents.length === 0) {
      return;
    }

    try {
      let enqueuedCount = 0;
      let droppedCount = 0;
      let maxRetriesReachedCount = 0;

      // Process all retries in parallel (non-blocking)
      // Don't wait for backoff - let the buffer handle the delay naturally
      for (const event of failedEvents) {
        try {
          // Validate and limit retryCount to prevent corruption
          const currentRetryCount = event.retryCount || 0;
          const retryCount = Math.min(
            Math.max(0, currentRetryCount) + 1,
            this.maxRetries,
          );

          if (retryCount < this.maxRetries) {
            // For duplicate eventId errors, regenerate eventId to avoid collision
            // Check if this is likely a duplicate eventId issue (first retry)
            const shouldRegenerateEventId =
              retryCount === 1 &&
              (event.retryCount === undefined || event.retryCount === 0);

            // Increment retry count and re-enqueue immediately
            // The buffer will naturally space out retries through batch processing
            const retryEvent: EnrichedEvent = {
              ...event,
              // Regenerate eventId if this might be a duplicate (very rare case)
              eventId: shouldRegenerateEventId
                ? `evt_${randomBytes(6).toString('hex')}`
                : event.eventId,
              retryCount,
            };

            // Log if eventId was regenerated
            if (shouldRegenerateEventId) {
              this.logger.debug(
                `Regenerated eventId for retry: ${event.eventId} -> ${retryEvent.eventId}`,
              );
            }

            const enqueued = this.eventBufferService.enqueue(retryEvent);
            if (enqueued) {
              enqueuedCount++;
              this.logger.debug(
                `Re-enqueued event ${event.eventId} for retry (attempt ${retryCount}/${this.maxRetries})`,
              );
            } else {
              droppedCount++;
              ErrorLogger.logWarning(
                this.logger,
                'Failed to re-enqueue event for retry: buffer full',
                ErrorLogger.createContext(event.eventId, event.service, {
                  retryCount: retryEvent.retryCount,
                }),
              );
            }
          } else {
            // Permanently failed - log to dead-letter
            maxRetriesReachedCount++;
            ErrorLogger.logError(
              this.logger,
              `Event permanently failed after ${this.maxRetries} retries`,
              new Error('Max retries exceeded'),
              ErrorLogger.createContext(event.eventId, event.service, {
                timestamp: event.timestamp,
                maxRetries: this.maxRetries,
              }),
            );
            // In production, you might want to persist these to a dead-letter table
            // For MVP, we log and continue (system never crashes)
          }
        } catch (error) {
          // Log error for individual event retry but continue with next event
          const retryCount = (event.retryCount || 0) + 1;
          ErrorLogger.logError(
            this.logger,
            'Error processing retry for event',
            error,
            ErrorLogger.createContext(event.eventId, event.service, {
              retryCount,
            }),
          );
        }
      }

      // Log summary
      if (enqueuedCount > 0 || droppedCount > 0 || maxRetriesReachedCount > 0) {
        ErrorLogger.logWarning(this.logger, 'Retry summary', {
          enqueuedCount,
          droppedCount,
          maxRetriesReachedCount,
        });
      }
    } catch (error) {
      // Log error but don't throw - worker should continue
      ErrorLogger.logError(this.logger, 'Error in retryFailed', error, {
        failedEventsCount: failedEvents.length,
      });
    }
  }
}
