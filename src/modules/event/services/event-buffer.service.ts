import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createWriteStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { Inject } from '@nestjs/common';
import { IErrorLoggerService } from '../../common/services/interfaces/error-logger-service.interface';
import { IMetricsCollectorService } from '../../common/services/interfaces/metrics-collector-service.interface';
import { METRICS_COLLECTOR_SERVICE_TOKEN } from '../../common/services/interfaces/metrics-collector-service.token';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../../common/services/interfaces/error-logger-service.token';
import { CONFIG_TOKENS } from '../../config/tokens/config.tokens';
import { BufferConfig } from '../../config/interfaces/buffer-config.interface';
import { CheckpointConfig } from '../../config/interfaces/checkpoint-config.interface';
import { MetricsDto } from '../dtos/metrics-response.dto';
import { EnrichedEvent } from './interfaces/enriched-event.interface';
import { IEventBufferService } from './interfaces/event-buffer-service.interface';

@Injectable()
export class EventBufferService
  implements IEventBufferService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EventBufferService.name);
  
  /**
   * Buffer array containing all events (both consumed and unconsumed)
   * Uses a "head index" strategy for efficient operations:
   * - Events are added with push() at the end (O(1))
   * - Events are "removed" by moving bufferHead index (O(1) per drain)
   * - This avoids expensive shift() operations which would be O(n) per element
   */
  private readonly buffer: EnrichedEvent[] = [];
  
  /**
   * Index pointing to the first valid (not yet consumed) event in the buffer array
   * 
   * HOW IT WORKS:
   * - buffer[0] to buffer[bufferHead-1] are "consumed" events (already drained)
   * - buffer[bufferHead] to buffer[buffer.length-1] are "active" events (available)
   * - When draining, we extract from bufferHead and then increment it
   * - This avoids physically removing elements, keeping operations O(1)
   * 
   * Example:
   *   buffer = [event1, event2, event3, event4, event5]
   *   bufferHead = 2
   *   → event1 and event2 are consumed (ignored)
   *   → event3, event4, event5 are active (getSize() returns 3)
   * 
   * Periodically we compact the array when bufferHead > 50% of array length
   * to free memory from consumed events.
   */
  private bufferHead = 0;
  private readonly maxSize: number;
  private checkpointInterval: NodeJS.Timeout | null = null;
  private readonly checkpointPath: string;
  private readonly checkpointDir: string;
  private readonly checkpointIntervalMs: number;

  constructor(
    @Inject(METRICS_COLLECTOR_SERVICE_TOKEN)
    private readonly metricsCollector: IMetricsCollectorService,
    @Inject(ERROR_LOGGER_SERVICE_TOKEN)
    private readonly errorLogger: IErrorLoggerService,
    @Inject(CONFIG_TOKENS.BUFFER)
    bufferConfig: BufferConfig,
    @Inject(CONFIG_TOKENS.CHECKPOINT)
    checkpointConfig: CheckpointConfig,
  ) {
    // Configuration injected via ConfigModule
    this.maxSize = bufferConfig.maxSize;
    this.checkpointDir = path.join(process.cwd(), 'checkpoints');
    this.checkpointPath = path.join(
      this.checkpointDir,
      'buffer-checkpoint.json',
    );
    // Checkpoint interval injected via ConfigModule
    this.checkpointIntervalMs = checkpointConfig.intervalMs;
  }

  /**
   * Initialize buffer service on module startup
   * 
   * This method is automatically called when the NestJS module initializes.
   * It performs three critical operations:
   * 1. Creates the checkpoint directory if it doesn't exist
   * 2. Loads events from checkpoint if exists (recovery after a crash)
   * 3. Starts periodic checkpointing to enable recovery from failures
   * 
   * A checkpoint is a JSON file that saves the current buffer state to disk,
   * allowing recovery of events that were in memory if the system restarts unexpectedly.
   */
  async onModuleInit() {
    // Create checkpoint directory
    await this.ensureCheckpointDir();

    // Load checkpoint on startup (if exists)
    await this.loadCheckpoint();

    // Start periodic checkpointing
    this.startCheckpointing();

    this.logger.log(
      `Event buffer initialized (max_size=${this.maxSize}, checkpoint_interval=${this.checkpointIntervalMs}ms)`,
    );
  }

  /**
   * Cleanup on module destruction
   * 
   * This method is automatically called when the NestJS module is destroyed (shutdown).
   * Ensures no events are lost by saving a final checkpoint if there are events in the buffer.
   * 
   * Process:
   * 1. Stops the periodic checkpointing interval
   * 2. If there are active events in the buffer, saves a final checkpoint before closing
   * 3. This ensures unprocessed events can be recovered on the next startup
   */
  async onModuleDestroy() {
    // Stop periodic checkpointing
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
      this.checkpointInterval = null;
    }

    // Save final checkpoint before shutdown
    // Use getSize() to check for active events (ignores already-drained events)
    const activeEventsCount = this.getSize();
    if (activeEventsCount > 0) {
      this.logger.log(
        `Saving final checkpoint with ${activeEventsCount} events`,
      );
      await this.saveCheckpoint();
    }

    this.logger.log('Event buffer service destroyed');
  }

  /**
   * Add an event to the buffer (non-blocking operation)
   * 
   * This is the main method for adding events to the buffer. It checks if there's
   * available space before adding. If the buffer is full, the event is discarded
   * and the dropped events counter is incremented.
   * 
   * @param event - Enriched event (EnrichedEvent) containing all event information
   *                including metadata, timestamps, service name, etc.
   * @returns true if the event was successfully added to the buffer,
   *          false if the buffer is full and the event was discarded
   * 
   * @example
   * ```typescript
   * const success = bufferService.enqueue(event);
   * if (!success) {
   *   logger.warn('Buffer full, event discarded');
   * }
   * ```
   */
  public enqueue(event: EnrichedEvent): boolean {
    // Use getSize() to account for bufferHead (efficient draining)
    if (this.getSize() >= this.maxSize) {
      this.metricsCollector.recordBufferDrop();
      return false;
    }

    this.buffer.push(event);
    this.metricsCollector.recordBufferEnqueue();
    return true;
  }

  /**
   * Compact the buffer array when needed to free memory
   * 
   * CONTEXT: This buffer uses a "head index" strategy for efficiency:
   * - Events are added with push() at the end of the array
   * - Events are virtually removed by moving bufferHead (index of first valid element)
   * - This avoids expensive operations like shift() which would be O(n)
   * 
   * PROBLEM: If we never physically remove elements, the array grows indefinitely
   * even though many elements are already "consumed" (bufferHead advanced).
   * 
   * SOLUTION: When bufferHead > 50% of array length, we physically remove
   * the already-consumed elements. This frees memory while maintaining efficiency.
   * 
   * @private
   * 
   * @example
   * Before: [drained, drained, drained, valid, valid, valid]
   *                            ↑ bufferHead = 3
   * After:  [valid, valid, valid] with bufferHead = 0
   */
  private compactBufferIfNeeded(): void {
    if (this.bufferHead > this.buffer.length / 2) {
      this.buffer.splice(0, this.bufferHead);
      this.bufferHead = 0;
    }
  }

  /**
   * Serialize events to write stream with error handling
   * 
   * This method converts events to JSON format and writes them to a file stream.
   * It handles serialization errors gracefully by skipping problematic events
   * (e.g., circular references) instead of failing the entire checkpoint operation.
   * 
   * Each event is written as a JSON object separated by commas, with proper
   * formatting for a JSON array structure.
   * 
   * @param events - Array of events to serialize to JSON
   * @param writeStream - Node.js write stream to write the serialized events to
   * @returns Object containing:
   *          - serializedCount: number of events successfully serialized
   *          - failedCount: number of events that failed to serialize
   * @private
   */
  private serializeEventsToStream(
    events: EnrichedEvent[],
    writeStream: ReturnType<typeof createWriteStream>,
  ): { serializedCount: number; failedCount: number } {
    let serializedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < events.length; i++) {
      try {
        const eventJson = JSON.stringify(events[i]);
        const isLast = i === events.length - 1;
        writeStream.write(`  ${eventJson}${isLast ? '\n' : ',\n'}`);
        serializedCount++;
      } catch (error: any) {
        // If stringify fails (e.g., circular reference), log and skip this event
        // This should be extremely rare as sanitizer should prevent it
        failedCount++;
        this.errorLogger.logError(
          this.logger,
          'Failed to serialize event for checkpoint, skipping',
          error,
          {
            eventId: events[i]?.eventId || 'unknown',
            service: events[i]?.service || 'unknown',
            index: i,
          },
        );
        // Continue with next event - don't fail entire checkpoint
      }
    }

    return { serializedCount, failedCount };
  }

  /**
   * Validate and fix bufferHead if desynchronized
   * 
   * bufferHead is an index that points to the first valid (not yet consumed) event
   * in the buffer array. This method ensures bufferHead is always within valid bounds
   * to prevent index out of bounds errors.
   * 
   * Why this is needed:
   * - bufferHead should always be between 0 and buffer.length
   * - If it's negative or >= buffer.length, the buffer state is inconsistent
   * - This can happen due to bugs or unexpected state changes
   * 
   * This is a safety check that ensures the buffer remains in a consistent state.
   * 
   * @private
   */
  private validateAndFixBufferHead(): void {
    if (this.bufferHead < 0) {
      this.logger.warn(
        `Buffer head is negative (head: ${this.bufferHead}), resetting to 0`,
      );
      this.bufferHead = 0;
    }
    if (this.bufferHead >= this.buffer.length) {
      this.logger.warn(
        `Buffer head desynchronized (head: ${this.bufferHead}, length: ${this.buffer.length}), resetting`,
      );
      this.bufferHead = 0;
    }
  }

  /**
   * Drain events from the buffer
   * 
   * This method extracts events from the buffer for processing. It removes events
   * from the buffer and returns them as an array. The buffer uses an efficient
   * "head index" strategy instead of expensive array shift() operations.
   * 
   * How it works:
   * 1. Validates batchSize parameter (must be > 0)
   * 2. Caps batchSize to prevent excessive memory usage
   * 3. Extracts events starting from bufferHead (the first valid event)
   * 4. Updates bufferHead to mark those events as consumed
   * 5. Periodically compacts the array to free memory
   * 
   * This operation is O(n) where n is the batch size, but avoids O(n²) complexity
   * that would occur if we used shift() repeatedly.
   * 
   * @param batchSize - Maximum number of events to extract from the buffer
   * @returns Array of events (up to batchSize), or empty array if buffer is empty
   * 
   * @example
   * ```typescript
   * const events = bufferService.drain(100); // Get up to 100 events
   * if (events.length > 0) {
   *   await processEvents(events);
   * }
   * ```
   */
  public drain(batchSize: number): EnrichedEvent[] {
    // Validate batchSize parameter
    if (batchSize <= 0) {
      this.logger.warn(
        `Invalid batchSize: ${batchSize}, must be > 0. Returning empty array.`,
      );
      return [];
    }

    // Cap batchSize to prevent excessive memory usage
    const safeBatchSize = Math.min(batchSize, this.maxSize);

    const currentSize = this.getSize();
    if (currentSize === 0) {
      return [];
    }

    // Validate and fix bufferHead if needed (prevent desynchronization)
    this.validateAndFixBufferHead();

    const count = Math.min(safeBatchSize, currentSize);
    const batch: EnrichedEvent[] = [];

    // Efficiently extract events (O(n) but only once, not per element)
    // Extract events from bufferHead to bufferHead + count
    for (let i = 0; i < count; i++) {
      const index = this.bufferHead + i;
      if (index >= this.buffer.length) {
        // Safety check: should not happen after validateAndFixBufferHead()
        this.logger.warn(
          `Index out of bounds during drain (index: ${index}, length: ${this.buffer.length})`,
        );
        break;
      }
      batch.push(this.buffer[index]);
    }

    // Update head index to mark events as drained
    this.bufferHead += count;

    // Periodically compact array to prevent memory growth
    // Compact when head is > 50% of array length to free memory
    this.compactBufferIfNeeded();

    // Record drain event if events were extracted
    if (batch.length > 0) {
      this.metricsCollector.recordBufferDrain();
    }

    return batch;
  }

  /**
   * Get current number of events in buffer
   * 
   * Returns the count of events that are still available for processing.
   * This accounts for the bufferHead index, which tracks how many events
   * have already been consumed/drained.
   * 
   * Formula: actual size = array length - bufferHead (consumed events)
   * 
   * @returns Current number of valid events in buffer (not yet consumed)
   */
  public getSize(): number {
    return this.buffer.length - this.bufferHead;
  }

  /**
   * Get maximum buffer capacity
   *
   * @returns Maximum number of events buffer can hold
   */
  public getCapacity(): number {
    return this.maxSize;
  }

  /**
   * Check if buffer has reached maximum capacity
   *
   * @returns true if buffer is full, false otherwise
   */
  public isFull(): boolean {
    return this.getSize() >= this.maxSize;
  }

  /**
   * Get buffer metrics and statistics
   * 
   * Calculates and returns comprehensive metrics about the buffer's performance
   * and health status. These metrics are useful for monitoring and alerting.
   * 
   * Metrics included:
   * - Current size and capacity (utilization percentage)
   * - Total events enqueued and dropped
   * - Drop rate (percentage of events that couldn't be enqueued)
   * - Throughput (events per second)
   * - Health status (healthy/warning/critical based on utilization and drop rate)
   * - Time since last enqueue/drain operations
   * - Uptime (how long the buffer service has been running)
   * 
   * Health status thresholds:
   * - critical: utilization >= 90% OR drop rate > 5%
   * - warning: utilization >= 70% OR drop rate > 1%
   * - healthy: otherwise
   * 
   * @returns MetricsDto object containing all buffer metrics and statistics
   * @throws Logs error with context and returns default metrics if calculation fails
   */
  public getMetrics(): MetricsDto {
    try {
      const currentTime = Date.now();
      const bufferMetrics = this.metricsCollector.getBufferMetrics();
      const uptimeSeconds = (currentTime - bufferMetrics.startTime) / 1000;
      const currentSize = this.getSize();
      const utilizationPercent = (currentSize / this.maxSize) * 100;

      // Calculate drop rate (percentage of events dropped)
      // Drop rate = dropped / (enqueued + dropped) * 100
      const totalAttempted =
        bufferMetrics.totalEnqueued + bufferMetrics.totalDropped;
      const dropRate =
        totalAttempted > 0
          ? (bufferMetrics.totalDropped / totalAttempted) * 100
          : 0;

      // Calculate throughput (events per second)
      const throughput =
        uptimeSeconds > 0 ? bufferMetrics.totalEnqueued / uptimeSeconds : 0;

      // Determine health status based on utilization and drop rate
      let healthStatus: 'healthy' | 'warning' | 'critical';
      if (utilizationPercent >= 90 || dropRate > 5) {
        healthStatus = 'critical';
      } else if (utilizationPercent >= 70 || dropRate > 1) {
        healthStatus = 'warning';
      } else {
        healthStatus = 'healthy';
      }

      // Calculate time since last operations
      const timeSinceLastEnqueue =
        bufferMetrics.lastEnqueueTime > 0
          ? (currentTime - bufferMetrics.lastEnqueueTime) / 1000
          : null;
      const timeSinceLastDrain =
        bufferMetrics.lastDrainTime > 0
          ? (currentTime - bufferMetrics.lastDrainTime) / 1000
          : null;

      return new MetricsDto({
        totalEnqueued: bufferMetrics.totalEnqueued,
        totalDropped: bufferMetrics.totalDropped,
        currentSize,
        capacity: this.maxSize,
        utilizationPercent,
        dropRate,
        throughput,
        healthStatus,
        uptimeSeconds,
        timeSinceLastEnqueue,
        timeSinceLastDrain,
      });
    } catch (error) {
      // Log error with standardized format and context
      this.errorLogger.logError(
        this.logger,
        'Error calculating buffer metrics',
        error,
        {
          currentSize: this.getSize(),
          capacity: this.maxSize,
        },
      );
      // Return default metrics to prevent breaking health checks
      return new MetricsDto({
        totalEnqueued: 0,
        totalDropped: 0,
        currentSize: this.getSize(),
        capacity: this.maxSize,
        utilizationPercent: 0,
        dropRate: 0,
        throughput: 0,
        healthStatus: 'healthy',
        uptimeSeconds: 0,
        timeSinceLastEnqueue: null,
        timeSinceLastDrain: null,
      });
    }
  }

  /**
   * Ensure checkpoint directory exists
   * 
   * This method creates the checkpoint directory if it doesn't exist.
   * Uses recursive option to create parent directories if needed.
   * 
   * The checkpoint directory is where checkpoint files are stored.
   * If creation fails, the error is logged and re-thrown since the
   * buffer service cannot function without the checkpoint directory.
   * 
   * @throws Error if directory creation fails (permissions, disk full, etc.)
   * @private
   */
  private async ensureCheckpointDir(): Promise<void> {
    try {
      await fs.mkdir(this.checkpointDir, { recursive: true });
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to create checkpoint directory',
        error,
        { checkpointDir: this.checkpointDir },
      );
      throw error;
    }
  }

  /**
   * Load checkpoint from disk on startup
   * 
   * This method attempts to recover events that were saved to disk before a system
   * crash or unexpected shutdown. It reads the checkpoint file, validates events,
   * and loads them back into the buffer.
   * 
   * Process:
   * 1. Reads the checkpoint JSON file from disk
   * 2. Validates that it's a valid array structure
   * 3. Validates each event before loading (checks required fields and formats)
   * 4. Loads valid events into the buffer (respects max capacity)
   * 5. Deletes the checkpoint file after successful load (prevents duplicates)
   * 
   * Error handling:
   * - If checkpoint doesn't exist (ENOENT), this is normal (first run)
   * - Invalid events are skipped with a warning
   * - If buffer fills up during loading, loading stops and warns
   * - Errors are logged but don't prevent service startup
   * 
   * @private
   */
  private async loadCheckpoint(): Promise<void> {
    try {
      const data = await fs.readFile(this.checkpointPath, 'utf-8');
      const events: EnrichedEvent[] = JSON.parse(data);

      if (!Array.isArray(events)) {
        this.errorLogger.logWarning(
          this.logger,
          'Checkpoint file is not a valid array, ignoring',
          { checkpointPath: this.checkpointPath },
        );
        return;
      }

      // Load events into buffer (respecting maximum capacity)
      let loadedCount = 0;
      let invalidCount = 0;
      for (const event of events) {
        if (this.getSize() >= this.maxSize) {
          this.errorLogger.logWarning(
            this.logger,
            'Buffer full while loading checkpoint, stopping',
            {
              loadedCount,
              maxSize: this.maxSize,
            },
          );
          break;
        }

        // Validate event before loading
        if (this.isValid(event)) {
          this.buffer.push(event);
          loadedCount++;
        } else {
          invalidCount++;
          const eventId = (event as any)?.eventId || 'unknown';
          this.errorLogger.logWarning(
            this.logger,
            'Invalid event in checkpoint, skipping',
            this.errorLogger.createContext(eventId, undefined),
          );
        }
      }

      // Log summary of checkpoint loading
      if (invalidCount > 0) {
        this.logger.warn(
          `Checkpoint loaded: ${loadedCount} valid, ${invalidCount} invalid events`,
        );
      }

      if (loadedCount > 0) {
        this.logger.log(
          `Loaded ${loadedCount} events from checkpoint (recovered from previous crash)`,
        );
        // Record loaded events as enqueued (they were recovered from checkpoint)
        for (let i = 0; i < loadedCount; i++) {
          this.metricsCollector.recordBufferEnqueue();
        }
      }

      // Delete checkpoint after loading (prevent duplicates)
      try {
        await fs.unlink(this.checkpointPath);
        this.logger.debug('Checkpoint file deleted after successful load');
      } catch (error) {
        this.errorLogger.logWarning(
          this.logger,
          'Failed to delete checkpoint file',
          { checkpointPath: this.checkpointPath },
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // No checkpoint found (first run or already processed) - this is normal
        this.logger.debug('No checkpoint file found (normal on first run)');
      } else {
        this.errorLogger.logError(this.logger, 'Failed to load checkpoint', error, {
          checkpointPath: this.checkpointPath,
        });
        // Don't throw error - continue without checkpoint
      }
    }
  }

  /**
   * Save current buffer state to disk (checkpoint)
   * 
   * This method saves the current buffer contents to disk as a JSON file, allowing
   * recovery of events if the system crashes or shuts down unexpectedly.
   * 
   * Key features:
   * 1. Streaming: Uses file streams instead of loading all events in memory at once
   *    - This is memory-efficient even with large buffers
   *    - Events are serialized and written one at a time
   * 
   * 2. Atomic writes: Uses a temporary file + rename pattern
   *    - Writes to a .tmp file first
   *    - Renames to final filename only after successful write
   *    - Prevents partial/corrupted checkpoints if write fails midway
   * 
   * 3. Error handling: Continues gracefully if checkpoint fails
   *    - Logs errors but doesn't throw (system can continue without checkpoint)
   *    - Cleans up temp files on error
   *    - Skips serialization errors for individual events (continues with rest)
   * 
   * Only saves active events (from bufferHead to end), ignoring already-drained events.
   * 
   * @returns Promise that resolves when checkpoint is successfully saved, or
   *          resolves immediately if buffer is empty (nothing to save)
   * @private
   */
  private async saveCheckpoint(): Promise<void> {
    const currentSize = this.getSize();
    if (currentSize === 0) {
      return; // Nothing to save
    }

    const tempPath = this.checkpointPath + '.tmp';
    let writeStream: ReturnType<typeof createWriteStream> | null = null;
    // Get active events (from bufferHead to end) - declare outside try for error logging
    const events = this.buffer.slice(this.bufferHead);

    try {
      // Stream to disk instead of loading all in memory
      writeStream = createWriteStream(tempPath, { encoding: 'utf-8' });

      // Write JSON array opening bracket
      writeStream.write('[\n');

      // Stream each event as JSON with error handling
      const serializationResult = this.serializeEventsToStream(
        events,
        writeStream,
      );

      // Log summary if any events failed to serialize
      if (serializationResult.failedCount > 0) {
        this.logger.warn(
          `Checkpoint serialization: ${serializationResult.serializedCount} succeeded, ${serializationResult.failedCount} failed`,
        );
      }

      // Write JSON array closing bracket
      writeStream.write(']');

      // Close stream and wait for it to finish
      await new Promise<void>((resolve, reject) => {
        writeStream!.end();
        writeStream!.on('finish', resolve);
        writeStream!.on('error', reject);
      });

      // Rename (atomic operation on most systems)
      await fs.rename(tempPath, this.checkpointPath);

      this.logger.debug(
        `Checkpoint saved: ${events.length} events to ${this.checkpointPath} (streamed)`,
      );
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath).catch(() => {
          // Ignore errors when cleaning up
        });
      } catch {
        // Ignore cleanup errors
      }

      this.errorLogger.logError(this.logger, 'Failed to save checkpoint', error, {
        checkpointPath: this.checkpointPath,
        eventsCount: events.length,
      });
      // Don't throw error - system can continue without checkpoint
    } finally {
      // Ensure stream is closed
      if (writeStream && !writeStream.closed) {
        writeStream.destroy();
      }
    }
  }

  /**
   * Start periodic checkpointing
   * 
   * Sets up an interval timer that automatically saves the buffer to disk
   * at regular intervals. This ensures events are periodically persisted,
   * reducing data loss in case of unexpected shutdowns.
   * 
   * How it works:
   * - Uses setInterval to schedule periodic saves
   * - Only saves if there are active events in the buffer (checks getSize() > 0)
   * - Interval is configured via CHECKPOINT_INTERVAL_MS environment variable
   * - Errors during checkpoint save are logged but don't stop the interval
   * 
   * The interval is stored in this.checkpointInterval and can be stopped
   * by calling clearInterval() (done automatically in onModuleDestroy).
   * 
   * @private
   */
  private startCheckpointing(): void {
    this.checkpointInterval = setInterval(() => {
      // Use getSize() to check for active events (ignores already-drained events)
      if (this.getSize() > 0) {
        this.saveCheckpoint().catch((error) => {
          this.errorLogger.logError(
            this.logger,
            'Error in checkpoint interval',
            error,
            { checkpointIntervalMs: this.checkpointIntervalMs },
          );
        });
      }
    }, this.checkpointIntervalMs);

    this.logger.log(
      `Checkpointing started (interval: ${this.checkpointIntervalMs}ms)`,
    );
  }

  /**
   * Validate event structure before loading from checkpoint
   * 
   * This method performs type checking and format validation on events loaded
   * from checkpoint files. It ensures events have the correct structure and
   * data types before allowing them into the buffer.
   * 
   * Validation checks:
   * 1. Event is an object (not null, not primitive)
   * 2. Required fields exist with correct types:
   *    - eventId: string (must match pattern evt_[12 hex chars])
   *    - timestamp: string (must be parseable as Date)
   *    - service: string
   *    - message: string
   *    - ingestedAt: string (must be parseable as Date)
   * 3. eventId format: must match regex /^evt_[0-9a-f]{12}$/i
   * 4. Timestamps are valid dates (not NaN)
   * 
   * This is a TypeScript type guard, so if it returns true, TypeScript knows
   * the event is a valid EnrichedEvent.
   * 
   * @param event - Event object to validate (can be any type)
   * @returns true if event is a valid EnrichedEvent with correct structure and format,
   *          false otherwise
   * @private
   */
  private isValid(event: any): event is EnrichedEvent {
    // Early return: check basic structure
    if (
      !event ||
      typeof event !== 'object' ||
      typeof event.eventId !== 'string' ||
      typeof event.timestamp !== 'string' ||
      typeof event.service !== 'string' ||
      typeof event.message !== 'string' ||
      typeof event.ingestedAt !== 'string'
    ) {
      return false;
    }

    // Validate eventId format: must start with 'evt_' and have 12 hex characters
    const eventIdPattern = /^evt_[0-9a-f]{12}$/i;
    if (!eventIdPattern.test(event.eventId)) {
      return false;
    }

    // Validate timestamps are parseable
    const timestampDate = new Date(event.timestamp);
    const ingestedDate = new Date(event.ingestedAt);
    if (
      isNaN(timestampDate.getTime()) ||
      isNaN(ingestedDate.getTime())
    ) {
      return false;
    }

    return true;
  }
}
