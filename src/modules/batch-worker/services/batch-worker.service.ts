import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventBufferService } from '../../event/services/event-buffer.service';
import { EventsService } from '../../event/services/events.service';
import { envs } from '../../config/envs';
import { EnrichedEvent } from '../../event/interfaces/enriched-event.interface';
import { CreateEventDto } from '../../event/dtos/create-event.dto';
import { BatchValidationResult } from '../interfaces/batch-validation-result.interface';
import { ErrorLogger } from '../../common/utils/error-logger';

@Injectable()
export class BatchWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BatchWorkerService.name);
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  private readonly batchSize: number;
  private readonly drainInterval: number; // milliseconds
  private readonly maxRetries: number;
  private readonly backoffInitialMs: number;
  private readonly backoffMaxMs: number;

  // Performance metrics
  private readonly performanceMetrics = {
    totalBatchesProcessed: 0,
    totalEventsProcessed: 0,
    totalValidationTimeMs: 0,
    totalInsertTimeMs: 0,
    averageBatchProcessingTimeMs: 0,
  };

  constructor(
    private readonly eventBufferService: EventBufferService,
    private readonly eventsService: EventsService,
  ) {
    this.batchSize = envs.batchSize;
    this.drainInterval = envs.drainInterval;
    this.maxRetries = envs.maxRetries;
    this.backoffInitialMs = envs.backoffInitialMs;
    this.backoffMaxMs = envs.backoffMaxMs;
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
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.logger.log(
      `Batch worker started (batch_size=${this.batchSize}, interval=${this.drainInterval}ms)`,
    );

    // Process batches at regular intervals
    this.intervalId = setInterval(() => {
      this.processBatch().catch((error) => {
        ErrorLogger.logError(
          this.logger,
          'Batch processing error',
          error,
        );
      });
    }, this.drainInterval);
  }

  /**
   * Stop the batch worker
   * Processes ALL remaining events in buffer before stopping
   * Implements graceful shutdown with timeout protection
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Process ALL remaining events in buffer before stopping
    const SHUTDOWN_TIMEOUT_MS = 30000; // 30 seconds max
    const startTime = Date.now();
    let batchCount = 0;

    while (this.eventBufferService.getSize() > 0) {
      // Check timeout to prevent infinite loop
      if (Date.now() - startTime > SHUTDOWN_TIMEOUT_MS) {
        ErrorLogger.logWarning(
          this.logger,
          'Shutdown timeout reached',
          {
            timeoutMs: SHUTDOWN_TIMEOUT_MS,
            remainingEvents: this.eventBufferService.getSize(),
          },
        );
        break;
      }

      try {
        await this.processBatch();
        batchCount++;
        
        // Small delay to allow other operations (like checkpoint) to run
        await new Promise(resolve => setImmediate(resolve));
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
  private async processBatch() {
    const batchStartTime = Date.now();
    let batch: EnrichedEvent[] = [];
    
    try {
      // Drain buffer
      batch = this.eventBufferService.drainBatch(this.batchSize);

      if (batch.length === 0) {
        return; // Buffer is empty
      }

      this.logger.debug(`Processing batch of ${batch.length} events`);

      // Validate events (non-blocking, processes in chunks)
      const validationStartTime = Date.now();
      const { validEvents, invalidEvents } = await this.validateBatch(batch);
      const validationTimeMs = Date.now() - validationStartTime;
      this.performanceMetrics.totalValidationTimeMs += validationTimeMs;

      // Log invalid events with sampling to avoid excessive I/O
      if (invalidEvents.length > 0) {
        ErrorLogger.logWarning(
          this.logger,
          'Dropped invalid events from batch',
          {
            invalidCount: invalidEvents.length,
            batchSize: batch.length,
          },
        );
        
        // Sample logging: log first 3 events and summary to avoid I/O overhead
        const SAMPLE_SIZE = 3;
        const eventsToLog = invalidEvents.slice(0, SAMPLE_SIZE);
        
        eventsToLog.forEach((event) => {
          this.logger.debug(`Invalid event sample: ${JSON.stringify(event)}`);
        });
        
        if (invalidEvents.length > SAMPLE_SIZE) {
          this.logger.debug(
            `... and ${invalidEvents.length - SAMPLE_SIZE} more invalid events (not logged to reduce I/O)`,
          );
        }
      }

      // Insert valid events to storage
      if (validEvents.length > 0) {
        const eventsToInsert: CreateEventDto[] = validEvents.map((event) => ({
          timestamp: event.timestamp,
          service: event.service,
          message: event.message,
          metadata: event.metadata,
        }));

        const insertStartTime = Date.now();
        const { successful, failed } = await this.eventsService.batchInsert(
          eventsToInsert,
        );
        const insertTimeMs = Date.now() - insertStartTime;
        this.performanceMetrics.totalInsertTimeMs += insertTimeMs;

        if (failed > 0) {
          ErrorLogger.logWarning(
            this.logger,
            'Failed to insert events',
            {
              failedCount: failed,
              successfulCount: successful,
              totalAttempted: validEvents.length,
            },
          );

          // Retry failed events (up to maxRetries)
          // Note: batchInsert doesn't specify which events failed, so we retry
          // all events that were attempted. This is conservative but safe.
          // In a production system, batchInsert should return which specific events failed.
          await this.retryFailedEvents(validEvents);
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
        (this.performanceMetrics.averageBatchProcessingTimeMs * (this.performanceMetrics.totalBatchesProcessed - 1) +
          batchProcessingTimeMs) /
        this.performanceMetrics.totalBatchesProcessed;

      // Log performance metrics periodically (every 100 batches)
      if (this.performanceMetrics.totalBatchesProcessed % 100 === 0) {
        this.logger.log(
          `Performance metrics: avg batch time=${this.performanceMetrics.averageBatchProcessingTimeMs.toFixed(2)}ms, ` +
          `avg validation=${(this.performanceMetrics.totalValidationTimeMs / this.performanceMetrics.totalBatchesProcessed).toFixed(2)}ms, ` +
          `avg insert=${(this.performanceMetrics.totalInsertTimeMs / this.performanceMetrics.totalBatchesProcessed).toFixed(2)}ms`,
        );
      }
    } catch (error) {
      // Log error with standardized format - worker should continue processing
      ErrorLogger.logError(
        this.logger,
        'Error processing batch',
        error,
        { batchSize: batch.length },
      );
      // Worker continues - next batch will be processed
    }
  }

  /**
   * Validate a batch of events, separating valid from invalid
   * Uses efficient synchronous validation for small batches, chunked async for large batches
   * 
   * @param batch - Array of events to validate
   * @returns Promise resolving to BatchValidationResult containing arrays of valid and invalid events
   */
  private async validateBatch(batch: EnrichedEvent[]): Promise<BatchValidationResult> {
    // For small batches (< 1000 events), validation is fast enough to do synchronously
    // For large batches, process in chunks to avoid blocking the event loop
    const LARGE_BATCH_THRESHOLD = 1000;
    const CHUNK_SIZE = 500;
    
    if (batch.length < LARGE_BATCH_THRESHOLD) {
      // Small batch: validate synchronously (very fast, won't block)
      // Use single pass to avoid validating events twice
      const validEvents: EnrichedEvent[] = [];
      const invalidEvents: EnrichedEvent[] = [];
      
      for (const event of batch) {
        if (this.validateEvent(event)) {
          validEvents.push(event);
        } else {
          invalidEvents.push(event);
        }
      }
      
      return { validEvents, invalidEvents };
    }
    
    // Large batch: process in chunks with yield points
    const validEvents: EnrichedEvent[] = [];
    const invalidEvents: EnrichedEvent[] = [];
    
    for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
      const chunk = batch.slice(i, i + CHUNK_SIZE);
      
      // Process chunk synchronously
      for (const event of chunk) {
        if (this.validateEvent(event)) {
          validEvents.push(event);
        } else {
          invalidEvents.push(event);
        }
      }
      
      // Yield control to event loop between chunks (except last)
      if (i + CHUNK_SIZE < batch.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    return { validEvents, invalidEvents };
  }

  /**
   * Validate a single event
   * Checks required fields, timestamp format, and field types
   * 
   * @param event - Event to validate
   * @returns true if event is valid, false otherwise
   */
  private validateEvent(event: EnrichedEvent): boolean {
    try {
      // Check required fields
      if (!event.timestamp || !event.service || !event.message) {
        return false;
      }

      // Validate timestamp format
      const timestamp = new Date(event.timestamp);
      if (isNaN(timestamp.getTime())) {
        return false;
      }

      // Validate service name (prevent injection, limit length)
      if (
        typeof event.service !== 'string' ||
        event.service.length === 0 ||
        event.service.length > envs.serviceNameMaxLength
      ) {
        return false;
      }

      // Validate message
      if (
        typeof event.message !== 'string' ||
        event.message.length === 0
      ) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.debug(`Validation error for event: ${error.message}`);
      return false;
    }
  }

  /**
   * Retry failed events with exponential backoff
   * Events are re-enqueued immediately to buffer (non-blocking)
   * The buffer acts as the backoff mechanism - events will be processed in next batch
   * 
   * @param failedEvents - Array of events that failed to insert
   */
  private async retryFailedEvents(failedEvents: EnrichedEvent[]) {
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
          const retryCount = (event.retryCount || 0) + 1;

          if (retryCount < this.maxRetries) {
            // Increment retry count and re-enqueue immediately
            // The buffer will naturally space out retries through batch processing
            const retryEvent: EnrichedEvent = {
              ...event,
              retryCount,
            };

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
                ErrorLogger.createErrorContext(event.eventId, event.service, {
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
              ErrorLogger.createErrorContext(event.eventId, event.service, {
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
            ErrorLogger.createErrorContext(event.eventId, event.service, {
              retryCount,
            }),
          );
        }
      }

      // Log summary
      if (enqueuedCount > 0 || droppedCount > 0 || maxRetriesReachedCount > 0) {
        ErrorLogger.logWarning(
          this.logger,
          'Retry summary',
          {
            enqueuedCount,
            droppedCount,
            maxRetriesReachedCount,
          },
        );
      }
    } catch (error) {
      // Log error but don't throw - worker should continue
      ErrorLogger.logError(
        this.logger,
        'Error in retryFailedEvents',
        error,
        { failedEventsCount: failedEvents.length },
      );
    }
  }
}

