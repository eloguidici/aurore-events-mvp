import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventBufferService } from './event-buffer.service';
import { CircuitBreakerService } from '../../common/services/circuit-breaker.service';
import { IMetricsPersistenceService } from '../interfaces/metrics-persistence-service.interface';
import { envs } from '../../config/envs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ErrorLogger } from '../../common/utils/error-logger';

interface MetricsSnapshot {
  timestamp: string;
  buffer: {
    size: number;
    capacity: number;
    utilization_percent: string;
    total_enqueued: number;
    total_dropped: number;
    drop_rate_percent: string;
    throughput_events_per_second: string;
  };
  circuitBreaker: {
    state: string;
    failureCount: number;
    successCount: number;
  };
}

/**
 * Service for persisting metrics to disk
 * Saves metrics snapshots periodically for historical analysis
 */
@Injectable()
export class MetricsPersistenceService
  implements IMetricsPersistenceService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MetricsPersistenceService.name);
  private readonly metricsDir: string;
  private readonly metricsFile: string;
  private persistenceInterval: NodeJS.Timeout | null = null;
  private readonly PERSISTENCE_INTERVAL_MS = 60000; // 1 minute

  constructor(
    private readonly eventBufferService: EventBufferService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {
    this.metricsDir = path.join(process.cwd(), 'metrics');
    this.metricsFile = path.join(this.metricsDir, 'metrics-history.jsonl');
  }

  async onModuleInit() {
    // Create metrics directory
    try {
      await fs.mkdir(this.metricsDir, { recursive: true });
    } catch (error) {
      ErrorLogger.logError(
        this.logger,
        'Failed to create metrics directory',
        error,
        { metricsDir: this.metricsDir },
      );
    }

    // Start periodic persistence
    this.startPersistence();
    this.logger.log('Metrics persistence service initialized');
  }

  async onModuleDestroy() {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
      this.persistenceInterval = null;
    }
    // Save final metrics snapshot
    await this.saveMetrics();
    this.logger.log('Metrics persistence service destroyed');
  }

  /**
   * Start periodic metrics persistence
   */
  private startPersistence(): void {
    this.persistenceInterval = setInterval(() => {
      this.saveMetrics().catch((error) => {
        ErrorLogger.logError(this.logger, 'Error saving metrics', error);
      });
    }, this.PERSISTENCE_INTERVAL_MS);

    this.logger.log(
      `Metrics persistence started (interval: ${this.PERSISTENCE_INTERVAL_MS}ms)`,
    );
  }

  /**
   * Save current metrics snapshot to disk
   */
  private async saveMetrics(): Promise<void> {
    try {
      const bufferMetrics = this.eventBufferService.getMetrics();
      const circuitMetrics = this.circuitBreaker.getMetrics();

      const snapshot: MetricsSnapshot = {
        timestamp: new Date().toISOString(),
        buffer: {
          size: bufferMetrics.buffer_size,
          capacity: bufferMetrics.buffer_capacity,
          utilization_percent: bufferMetrics.buffer_utilization_percent,
          total_enqueued: bufferMetrics.metrics.total_enqueued,
          total_dropped: bufferMetrics.metrics.total_dropped,
          drop_rate_percent: bufferMetrics.metrics.drop_rate_percent,
          throughput_events_per_second:
            bufferMetrics.metrics.throughput_events_per_second,
        },
        circuitBreaker: {
          state: circuitMetrics.state,
          failureCount: circuitMetrics.failureCount,
          successCount: circuitMetrics.successCount,
        },
      };

      // Append to JSONL file (one JSON object per line)
      const line = JSON.stringify(snapshot) + '\n';
      await fs.appendFile(this.metricsFile, line, 'utf-8');

      this.logger.debug('Metrics snapshot saved');
    } catch (error) {
      ErrorLogger.logError(this.logger, 'Failed to save metrics', error, {
        metricsFile: this.metricsFile,
      });
    }
  }

  /**
   * Get metrics history (last N entries)
   */
  public async getMetricsHistory(
    limit: number = envs.metricsHistoryDefaultLimit,
  ): Promise<MetricsSnapshot[]> {
    try {
      const content = await fs.readFile(this.metricsFile, 'utf-8');
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.trim());
      const snapshots = lines
        .slice(-limit)
        .map((line) => JSON.parse(line) as MetricsSnapshot);
      return snapshots;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []; // File doesn't exist yet
      }
      ErrorLogger.logError(
        this.logger,
        'Failed to read metrics history',
        error,
        {
          metricsFile: this.metricsFile,
          limit,
        },
      );
      return [];
    }
  }
}
