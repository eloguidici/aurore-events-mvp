import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { randomBytes } from 'crypto';

import { MetricsCollectorService } from '../../common/services/metrics-collector.service';
import { ErrorLogger } from '../../common/utils/error-logger';
import { envs } from '../../config/envs';
import { EnrichedEvent } from '../../event/services/interfaces/enriched-event.interface';
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

  constructor(
    private readonly eventBufferService: EventBufferService,
    private readonly eventService: EventService,
    private readonly metricsCollector: MetricsCollectorService,
  ) {
    this.batchSize = envs.batchSize;
    this.drainInterval = envs.drainInterval;
    this.maxRetries = envs.maxRetries;
  }

  /**
   * Initialize batch worker when module starts
   * Automatically starts processing batches at configured intervals
   */
  onModuleInit() {
    this.start();
  }

  /**
   * Cleanup batch worker when module is destroyed
   * Processes all remaining events in buffer before stopping
   * Implements graceful shutdown with timeout protection
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
   * 
   * This method orchestrates the batch processing workflow:
   * 1. Extracts events from the buffer
   * 2. Inserts events to the database
   * 3. Handles retries for failed events
   * 4. Tracks performance metrics
   * 
   * The method handles errors gracefully - if processing fails, it logs the error
   * but continues running so the next batch can be processed.
   *
   * @private
   */
  private async process() {
    const batchStartTime = Date.now();
    let batch: EnrichedEvent[] = [];
    let insertTimeMs = 0;

    try {
      // Extract events from buffer, insert to database, and handle retries
      const result = await this.executeBatchProcessing();
      batch = result.batch;
      insertTimeMs = result.insertTimeMs;

      if (batch.length === 0) {
        return; // Buffer is empty, nothing to process
      }

      // Record batch processing metrics
      const batchProcessingTimeMs = Date.now() - batchStartTime;
      this.metricsCollector.recordBatchProcessed(
        batch.length,
        batchProcessingTimeMs,
        insertTimeMs,
      );
    } catch (error) {
      // Log error but continue processing - worker should never crash
      ErrorLogger.logError(this.logger, 'Error processing batch', error, {
        batchSize: batch.length,
      });
      // Worker continues - next batch will be processed
    }
  }

  /**
   * Execute the core batch processing workflow: extract, insert, and retry
   * 
   * This method handles the actual business logic of processing events:
   * - Drains events from the buffer (up to batchSize)
   * - Inserts events to the database via EventService
   * - Handles retries for events that failed to insert
   * 
   * Events are already validated before reaching this point:
   * - New events: validated by ValidationPipe before entering buffer
   * - Checkpoint events: validated when loaded from disk
   * - Retry events: validated in previous batch before re-enqueue
   * 
   * @returns Object containing batch and insertTimeMs for metrics tracking
   * @private
   */
  private async executeBatchProcessing(): Promise<{
    batch: EnrichedEvent[];
    insertTimeMs: number;
  }> {
    // Drain buffer (with validation of batch size to prevent memory issues)
    const requestedBatchSize = Math.min(
      this.batchSize,
      10000, // Hard limit to prevent memory issues
    );
    const batch = this.eventBufferService.drain(requestedBatchSize);

    if (batch.length === 0) {
      return { batch, insertTimeMs: 0 }; // Buffer is empty
    }

    this.logger.debug(`Processing batch of ${batch.length} events`);

    // All events are already validated:
    // - New events: validated by ValidationPipe before entering buffer
    // - Checkpoint events: validated when loaded from disk
    // - Retry events: validated in previous batch before re-enqueue
    // No need to validate again here

    // Insert events to storage
    // Pass EnrichedEvent[] directly to preserve eventId
    const insertStartTime = Date.now();
    const { successful, failed } = await this.eventService.insert(batch);
    const insertTimeMs = Date.now() - insertStartTime;

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

    return { batch, insertTimeMs };
  }


  /**
   * Calculate next retry count for an event
   * Validates and limits retryCount to prevent corruption
   *
   * @param event - Event to calculate retry count for
   * @returns Next retry count (capped at maxRetries)
   * @private
   */
  private calculateRetryCount(event: EnrichedEvent): number {
    const currentRetryCount = event.retryCount || 0;
    return Math.min(Math.max(0, currentRetryCount) + 1, this.maxRetries);
  }

  /**
   * Determine if eventId should be regenerated for retry
   * Regenerates on first retry to avoid potential duplicate key collisions
   *
   * @param retryCount - Current retry count
   * @param originalRetryCount - Original retry count from event
   * @returns true if eventId should be regenerated
   * @private
   */
  private shouldRegenerateEventId(
    retryCount: number,
    originalRetryCount: number | undefined,
  ): boolean {
    return retryCount === 1 && (originalRetryCount === undefined || originalRetryCount === 0);
  }

  /**
   * Prepare event for retry with updated retry count and potentially new eventId
   *
   * @param event - Original event that failed
   * @param retryCount - Calculated retry count
   * @returns EnrichedEvent ready for retry
   * @private
   */
  private prepareRetryEvent(
    event: EnrichedEvent,
    retryCount: number,
  ): EnrichedEvent {
    const shouldRegenerate = this.shouldRegenerateEventId(
      retryCount,
      event.retryCount,
    );

    const retryEvent: EnrichedEvent = {
      ...event,
      eventId: shouldRegenerate
        ? `evt_${randomBytes(6).toString('hex')}`
        : event.eventId,
      retryCount,
    };

    // Log if eventId was regenerated
    if (shouldRegenerate) {
      this.logger.debug(
        `Regenerated eventId for retry: ${event.eventId} -> ${retryEvent.eventId}`,
      );
    }

    return retryEvent;
  }

  /**
   * Attempt to enqueue event for retry
   *
   * @param retryEvent - Event prepared for retry
   * @param originalEventId - Original event ID for logging
   * @param retryCount - Current retry attempt number
   * @returns true if successfully enqueued, false otherwise
   * @private
   */
  private enqueueRetryEvent(
    retryEvent: EnrichedEvent,
    originalEventId: string,
    retryCount: number,
  ): boolean {
    const enqueued = this.eventBufferService.enqueue(retryEvent);

    if (enqueued) {
      this.logger.debug(
        `Re-enqueued event ${originalEventId} for retry (attempt ${retryCount}/${this.maxRetries})`,
      );
      return true;
    } else {
      ErrorLogger.logWarning(
        this.logger,
        'Failed to re-enqueue event for retry: buffer full',
        ErrorLogger.createContext(originalEventId, retryEvent.service, {
          retryCount: retryEvent.retryCount,
        }),
      );
      return false;
    }
  }

  /**
   * Handle event that has reached maximum retries
   * Logs to dead-letter queue (for MVP, just logs)
   *
   * @param event - Event that permanently failed
   * @private
   */
  private handleMaxRetriesReached(event: EnrichedEvent): void {
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

  /**
   * Retry failed events by re-enqueuing them to the buffer
   * Events are re-enqueued immediately (non-blocking)
   * The buffer naturally spaces out retries through batch processing intervals
   *
   * @param failedEvents - Array of events that failed to insert
   * @private
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
          const retryCount = this.calculateRetryCount(event);

          if (retryCount < this.maxRetries) {
            const retryEvent = this.prepareRetryEvent(event, retryCount);
            const enqueued = this.enqueueRetryEvent(
              retryEvent,
              event.eventId,
              retryCount,
            );

            if (enqueued) {
              enqueuedCount++;
            } else {
              droppedCount++;
            }
          } else {
            this.handleMaxRetriesReached(event);
            maxRetriesReachedCount++;
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
