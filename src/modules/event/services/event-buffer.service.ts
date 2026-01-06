import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { envs } from '../../config/envs';
import { EnrichedEvent } from '../interfaces/enriched-event.interface';
import { IEventBufferService } from '../interfaces/event-buffer-service.interface';
import { MetricsDto } from '../dtos/metrics-response.dto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream } from 'fs';
import { ErrorLogger } from '../../common/utils/error-logger';

@Injectable()
export class EventBufferService
  implements IEventBufferService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EventBufferService.name);
  // Use array with head index for O(1) dequeue operations
  // This avoids O(n) shift() operations when draining batches
  private readonly buffer: EnrichedEvent[] = [];
  private bufferHead = 0; // Index of first element (for efficient draining)
  private readonly maxSize: number;
  private readonly metrics = {
    totalEnqueued: 0,
    totalDropped: 0,
    startTime: Date.now(),
    lastEnqueueTime: 0,
    lastDrainTime: 0,
  };
  private checkpointInterval: NodeJS.Timeout | null = null;
  private readonly checkpointPath: string;
  private readonly checkpointDir: string;
  private readonly checkpointIntervalMs: number;

  constructor() {
    this.maxSize = envs.bufferMaxSize;
    this.checkpointDir = path.join(process.cwd(), 'checkpoints');
    this.checkpointPath = path.join(
      this.checkpointDir,
      'buffer-checkpoint.json',
    );
    // Checkpoint interval is required via environment variable (validated at startup)
    this.checkpointIntervalMs = envs.checkpointIntervalMs;
  }

  /**
   * Initialize buffer service on module startup
   * Creates checkpoint directory, loads existing checkpoint, and starts periodic checkpointing
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
   * Stops periodic checkpointing and saves final checkpoint if buffer has events
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
   * Enqueue an event to the buffer (non-blocking operation)
   *
   * @param event - Enriched event to add to buffer
   * @returns true if event was enqueued, false if buffer is full
   */
  public enqueue(event: EnrichedEvent): boolean {
    // Use getSize() to account for bufferHead (efficient draining)
    if (this.getSize() >= this.maxSize) {
      this.metrics.totalDropped++;
      return false;
    }

    this.buffer.push(event);
    this.metrics.totalEnqueued++;
    this.metrics.lastEnqueueTime = Date.now();
    return true;
  }

  /**
   * Drain events from the buffer
   * Removes events from buffer and returns them for processing
   * Uses efficient O(1) per-element removal instead of O(n) shift()
   *
   * @param batchSize - Maximum number of events to drain
   * @returns Array of events (up to batchSize), or empty array if buffer is empty
   */
  public drain(batchSize: number): EnrichedEvent[] {
    const currentSize = this.getSize();
    if (currentSize === 0) {
      return [];
    }

    const count = Math.min(batchSize, currentSize);
    const batch: EnrichedEvent[] = [];

    // Efficiently extract events using slice (O(n) but only once, not per element)
    // Then clear the drained portion
    for (let i = 0; i < count; i++) {
      const index = this.bufferHead + i;
      if (index < this.buffer.length) {
        batch.push(this.buffer[index]);
      }
    }

    // Update head index and clean up old references to prevent memory leaks
    this.bufferHead += count;

    // Periodically compact array to prevent memory growth
    // Compact when head is > 50% of array length
    if (this.bufferHead > this.buffer.length / 2) {
      this.buffer.splice(0, this.bufferHead);
      this.bufferHead = 0;
    }

    if (batch.length > 0) {
      this.metrics.lastDrainTime = Date.now();
    }

    return batch;
  }

  /**
   * Get current number of events in buffer
   *
   * @returns Current buffer size (number of events)
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
   * @returns MetricsDto containing buffer metrics and statistics
   */
  public getMetrics(): MetricsDto {
    const currentTime = Date.now();
    const uptimeSeconds = (currentTime - this.metrics.startTime) / 1000;
    const currentSize = this.getSize();
    const utilizationPercent = (currentSize / this.maxSize) * 100;

    // Calculate drop rate (percentage of events dropped)
    // Drop rate = dropped / (enqueued + dropped) * 100
    const totalAttempted =
      this.metrics.totalEnqueued + this.metrics.totalDropped;
    const dropRate =
      totalAttempted > 0
        ? (this.metrics.totalDropped / totalAttempted) * 100
        : 0;

    // Calculate throughput (events per second)
    const throughput =
      uptimeSeconds > 0 ? this.metrics.totalEnqueued / uptimeSeconds : 0;

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
      this.metrics.lastEnqueueTime > 0
        ? (currentTime - this.metrics.lastEnqueueTime) / 1000
        : null;
    const timeSinceLastDrain =
      this.metrics.lastDrainTime > 0
        ? (currentTime - this.metrics.lastDrainTime) / 1000
        : null;

    return new MetricsDto({
      ...this.metrics,
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
  }

  /**
   * Ensure checkpoint directory exists
   * Creates directory if it doesn't exist (recursive)
   *
   * @throws Error if directory creation fails
   */
  private async ensureCheckpointDir(): Promise<void> {
    try {
      await fs.mkdir(this.checkpointDir, { recursive: true });
    } catch (error) {
      ErrorLogger.logError(
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
   * Recovers events that were in buffer when system crashed
   */
  private async loadCheckpoint(): Promise<void> {
    try {
      const data = await fs.readFile(this.checkpointPath, 'utf-8');
      const events: EnrichedEvent[] = JSON.parse(data);

      if (!Array.isArray(events)) {
        ErrorLogger.logWarning(
          this.logger,
          'Checkpoint file is not a valid array, ignoring',
          { checkpointPath: this.checkpointPath },
        );
        return;
      }

      // Load events into buffer (respecting maximum capacity)
      let loadedCount = 0;
      for (const event of events) {
        if (this.getSize() >= this.maxSize) {
          ErrorLogger.logWarning(
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
          const eventId = (event as any)?.eventId || 'unknown';
          ErrorLogger.logWarning(
            this.logger,
            'Invalid event in checkpoint, skipping',
            ErrorLogger.createContext(eventId, undefined),
          );
        }
      }

      if (loadedCount > 0) {
        this.logger.log(
          `Loaded ${loadedCount} events from checkpoint (recovered from previous crash)`,
        );
        this.metrics.totalEnqueued += loadedCount;
      }

      // Delete checkpoint after loading (prevent duplicates)
      try {
        await fs.unlink(this.checkpointPath);
        this.logger.debug('Checkpoint file deleted after successful load');
      } catch (error) {
        ErrorLogger.logWarning(
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
        ErrorLogger.logError(this.logger, 'Failed to load checkpoint', error, {
          checkpointPath: this.checkpointPath,
        });
        // Don't throw error - continue without checkpoint
      }
    }
  }

  /**
   * Save current buffer state to disk (checkpoint)
   * This allows recovery if system crashes
   */
  /**
   * Save current buffer state to disk (checkpoint)
   * Uses streaming to avoid loading all events in memory
   * Uses atomic write (temp file + rename) to prevent corruption
   *
   * @returns Promise that resolves when checkpoint is saved
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

      // Stream each event as JSON
      for (let i = 0; i < events.length; i++) {
        const eventJson = JSON.stringify(events[i]);
        const isLast = i === events.length - 1;
        writeStream.write(`  ${eventJson}${isLast ? '\n' : ',\n'}`);
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

      ErrorLogger.logError(this.logger, 'Failed to save checkpoint', error, {
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
   * Saves buffer to disk at configured intervals
   * Interval is configured via CHECKPOINT_INTERVAL_MS environment variable
   */
  private startCheckpointing(): void {
    this.checkpointInterval = setInterval(() => {
      // Use getSize() to check for active events (ignores already-drained events)
      if (this.getSize() > 0) {
        this.saveCheckpoint().catch((error) => {
          ErrorLogger.logError(
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
   * Ensures event has all required fields with correct types
   *
   * @param event - Event object to validate
   * @returns true if event is valid EnrichedEvent, false otherwise
   */
  private isValid(event: any): event is EnrichedEvent {
    return (
      event &&
      typeof event === 'object' &&
      typeof event.eventId === 'string' &&
      typeof event.timestamp === 'string' &&
      typeof event.service === 'string' &&
      typeof event.message === 'string' &&
      typeof event.ingestedAt === 'string'
    );
  }
}
