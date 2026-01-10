import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { ICircuitBreakerService } from '../../common/services/interfaces/circuit-breaker-service.interface';
import { CIRCUIT_BREAKER_SERVICE_TOKEN } from '../../common/services/interfaces/circuit-breaker-service.token';
import { IErrorLoggerService } from '../../common/services/interfaces/error-logger-service.interface';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../../common/services/interfaces/error-logger-service.token';
import { MetricsConfig } from '../../config/interfaces/metrics-config.interface';
import { CONFIG_TOKENS } from '../../config/tokens/config.tokens';
import {
  IMetricsRepository,
  MetricsSnapshot,
} from '../repositories/interfaces/metrics.repository.interface';
import { METRICS_REPOSITORY_TOKEN } from '../repositories/interfaces/metrics.repository.token';
import { IEventBufferService } from './interfaces/event-buffer-service.interface';
import { EVENT_BUFFER_SERVICE_TOKEN } from './interfaces/event-buffer-service.token';
import { IMetricsPersistenceService } from './interfaces/metrics-persistence-service.interface';

/**
 * Service for persisting metrics to disk
 * Saves metrics snapshots periodically for historical analysis
 */
@Injectable()
export class MetricsPersistenceService
  implements IMetricsPersistenceService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MetricsPersistenceService.name);
  private persistenceInterval: NodeJS.Timeout | null = null;

  constructor(
    @Inject(EVENT_BUFFER_SERVICE_TOKEN)
    private readonly eventBufferService: IEventBufferService,
    @Inject(CIRCUIT_BREAKER_SERVICE_TOKEN)
    private readonly circuitBreaker: ICircuitBreakerService,
    @Inject(METRICS_REPOSITORY_TOKEN)
    private readonly metricsRepository: IMetricsRepository,
    @Inject(ERROR_LOGGER_SERVICE_TOKEN)
    private readonly errorLogger: IErrorLoggerService,
    @Inject(CONFIG_TOKENS.METRICS)
    private readonly metricsConfig: MetricsConfig,
  ) {}

  async onModuleInit() {
    // Initialize repository (creates directory if needed)
    try {
      if (
        'initialize' in this.metricsRepository &&
        typeof this.metricsRepository.initialize === 'function'
      ) {
        await (this.metricsRepository as any).initialize();
      }
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to initialize metrics repository',
        error,
      );
      // Continue - repository might handle initialization internally
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
        this.errorLogger.logError(this.logger, 'Error saving metrics', error);
      });
    }, this.metricsConfig.persistenceIntervalMs);

    this.logger.log(
      `Metrics persistence started (interval: ${this.metricsConfig.persistenceIntervalMs}ms)`,
    );
  }

  /**
   * Build metrics snapshot from current system state
   *
   * @returns MetricsSnapshot with current metrics
   * @private
   */
  private buildMetricsSnapshot(): MetricsSnapshot {
    const bufferMetrics = this.eventBufferService.getMetrics();
    const circuitMetrics = this.circuitBreaker.getMetrics();

    return {
      timestamp: new Date().toISOString(), // UTC timestamp (ISO 8601, ends with 'Z')
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
  }

  /**
   * Save current metrics snapshot using repository
   * Delegates persistence to the metrics repository
   */
  private async saveMetrics(): Promise<void> {
    try {
      const snapshot = this.buildMetricsSnapshot();
      await this.metricsRepository.save(snapshot);
      this.logger.debug('Metrics snapshot saved');
    } catch (error) {
      this.errorLogger.logError(this.logger, 'Failed to save metrics', error);
      // Don't throw - service should continue even if metrics persistence fails
    }
  }

  /**
   * Get metrics history (last N entries)
   * Delegates to metrics repository
   *
   * @param limit - Maximum number of entries to return (default: from metricsConfig.historyDefaultLimit)
   * @returns Array of metrics snapshots
   */
  public async getMetricsHistory(
    limit: number = this.metricsConfig.historyDefaultLimit,
  ): Promise<MetricsSnapshot[]> {
    try {
      return await this.metricsRepository.getHistory(limit);
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to get metrics history',
        error,
        { limit },
      );
      return [];
    }
  }
}
