import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as promClient from 'prom-client';

import { ICircuitBreakerService } from './interfaces/circuit-breaker-service.interface';
import { CIRCUIT_BREAKER_SERVICE_TOKEN } from './interfaces/circuit-breaker-service.token';
import { CircuitState } from './circuit-breaker.service';
import { IMetricsCollectorService } from './interfaces/metrics-collector-service.interface';
import { METRICS_COLLECTOR_SERVICE_TOKEN } from './interfaces/metrics-collector-service.token';
import { BusinessMetricsService } from '../../event/services/business-metrics.service';
import { IEventBufferService } from '../../event/services/interfaces/event-buffer-service.interface';
import { EVENT_BUFFER_SERVICE_TOKEN } from '../../event/services/interfaces/event-buffer-service.token';

/**
 * Prometheus metrics service
 * Registers and updates Prometheus metrics for the application
 * Exposes metrics in Prometheus format for scraping
 */
@Injectable()
export class PrometheusService implements OnModuleInit {
  private readonly logger = new Logger(PrometheusService.name);
  private readonly register: promClient.Registry;

  // Buffer metrics
  private readonly bufferSize: promClient.Gauge;
  private readonly bufferCapacity: promClient.Gauge;
  private readonly bufferUtilizationPercent: promClient.Gauge;
  private readonly eventsEnqueuedTotal: promClient.Gauge;
  private readonly eventsDroppedTotal: promClient.Gauge;
  private readonly eventsDropRatePercent: promClient.Gauge;
  private readonly eventsThroughputPerSecond: promClient.Gauge;
  private readonly bufferHealthStatus: promClient.Gauge;

  // Batch worker metrics
  private readonly batchesProcessedTotal: promClient.Gauge;
  private readonly eventsProcessedTotal: promClient.Gauge;
  private readonly batchProcessingTimeMs: promClient.Histogram;
  private readonly batchInsertTimeMs: promClient.Histogram;

  // Business metrics
  private readonly businessEventsTotal: promClient.Gauge;
  private readonly businessEventsLast24h: promClient.Gauge;
  private readonly businessEventsLastHour: promClient.Gauge;
  private readonly businessEventsByService: promClient.Gauge;

  // Health metrics
  private readonly healthStatus: promClient.Gauge;
  private readonly databaseConnectionStatus: promClient.Gauge;
  private readonly circuitBreakerState: promClient.Gauge;

  constructor(
    @Inject(METRICS_COLLECTOR_SERVICE_TOKEN)
    private readonly metricsCollector: IMetricsCollectorService,
    @Inject(EVENT_BUFFER_SERVICE_TOKEN)
    private readonly eventBufferService: IEventBufferService,
    private readonly businessMetricsService: BusinessMetricsService,
    @Inject(CIRCUIT_BREAKER_SERVICE_TOKEN)
    private readonly circuitBreaker: ICircuitBreakerService,
  ) {
    // Create a new registry for this service
    this.register = new promClient.Registry();

    // Add default metrics (CPU, memory, etc.)
    promClient.collectDefaultMetrics({ register: this.register });

    // Initialize buffer metrics
    this.bufferSize = new promClient.Gauge({
      name: 'buffer_size',
      help: 'Current buffer size',
      registers: [this.register],
    });

    this.bufferCapacity = new promClient.Gauge({
      name: 'buffer_capacity',
      help: 'Buffer capacity',
      registers: [this.register],
    });

    this.bufferUtilizationPercent = new promClient.Gauge({
      name: 'buffer_utilization_percent',
      help: 'Buffer utilization percentage',
      registers: [this.register],
    });

    this.eventsEnqueuedTotal = new promClient.Gauge({
      name: 'events_enqueued_total',
      help: 'Total number of events enqueued',
      registers: [this.register],
    });

    this.eventsDroppedTotal = new promClient.Gauge({
      name: 'events_dropped_total',
      help: 'Total number of events dropped',
      registers: [this.register],
    });

    this.eventsDropRatePercent = new promClient.Gauge({
      name: 'events_drop_rate_percent',
      help: 'Events drop rate percentage',
      registers: [this.register],
    });

    this.eventsThroughputPerSecond = new promClient.Gauge({
      name: 'events_throughput_per_second',
      help: 'Events throughput per second',
      registers: [this.register],
    });

    this.bufferHealthStatus = new promClient.Gauge({
      name: 'buffer_health_status',
      help: 'Buffer health status (1=healthy, 2=warning, 3=critical)',
      registers: [this.register],
    });

    // Initialize batch worker metrics
    this.batchesProcessedTotal = new promClient.Gauge({
      name: 'batches_processed_total',
      help: 'Total number of batches processed',
      registers: [this.register],
    });

    this.eventsProcessedTotal = new promClient.Gauge({
      name: 'events_processed_total',
      help: 'Total number of events processed',
      registers: [this.register],
    });

    this.batchProcessingTimeMs = new promClient.Histogram({
      name: 'batch_processing_time_ms',
      help: 'Batch processing time in milliseconds',
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
      registers: [this.register],
    });

    this.batchInsertTimeMs = new promClient.Histogram({
      name: 'batch_insert_time_ms',
      help: 'Batch insert time to database in milliseconds',
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
      registers: [this.register],
    });

    // Initialize business metrics
    this.businessEventsTotal = new promClient.Gauge({
      name: 'business_events_total',
      help: 'Total number of events in database',
      registers: [this.register],
    });

    this.businessEventsLast24h = new promClient.Gauge({
      name: 'business_events_last_24h',
      help: 'Number of events in last 24 hours',
      registers: [this.register],
    });

    this.businessEventsLastHour = new promClient.Gauge({
      name: 'business_events_last_hour',
      help: 'Number of events in last hour',
      registers: [this.register],
    });

    this.businessEventsByService = new promClient.Gauge({
      name: 'business_events_by_service',
      help: 'Number of events by service',
      labelNames: ['service'],
      registers: [this.register],
    });

    // Initialize health metrics
    this.healthStatus = new promClient.Gauge({
      name: 'health_status',
      help: 'Application health status (1=healthy, 0=unhealthy)',
      registers: [this.register],
    });

    this.databaseConnectionStatus = new promClient.Gauge({
      name: 'database_connection_status',
      help: 'Database connection status (1=connected, 0=disconnected)',
      registers: [this.register],
    });

    this.circuitBreakerState = new promClient.Gauge({
      name: 'circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
      registers: [this.register],
    });
  }

  async onModuleInit() {
    this.logger.log('Prometheus metrics service initialized');
    this.startMetricUpdates();
  }

  /**
   * Start periodic metric updates
   * Updates metrics every 5 seconds
   */
  private startMetricUpdates(): void {
    setInterval(() => {
      this.updateMetrics();
    }, 5000); // Update every 5 seconds
  }

  /**
   * Update all Prometheus metrics from current system state
   */
  private async updateMetrics(): Promise<void> {
    try {
      this.updateBufferMetrics();
      this.updateBatchWorkerMetrics();
      await this.updateBusinessMetrics();
      this.updateHealthMetrics();
    } catch (error) {
      this.logger.error('Error updating Prometheus metrics', error);
      this.healthStatus.set(0);
    }
  }

  /**
   * Update buffer-related metrics
   */
  private updateBufferMetrics(): void {
    const bufferMetrics = this.eventBufferService.getMetrics();
    
    this.bufferSize.set(bufferMetrics.buffer_size);
    this.bufferCapacity.set(bufferMetrics.buffer_capacity);
    this.bufferUtilizationPercent.set(
      parseFloat(bufferMetrics.buffer_utilization_percent),
    );
    this.eventsEnqueuedTotal.set(bufferMetrics.metrics.total_enqueued);
    this.eventsDroppedTotal.set(bufferMetrics.metrics.total_dropped);
    this.eventsDropRatePercent.set(
      parseFloat(bufferMetrics.metrics.drop_rate_percent),
    );
    this.eventsThroughputPerSecond.set(
      parseFloat(bufferMetrics.metrics.throughput_events_per_second),
    );

    // Map health status to numeric value
    const healthStatusValue =
      bufferMetrics.status === 'healthy'
        ? 1
        : bufferMetrics.status === 'warning'
          ? 2
          : 3;
    this.bufferHealthStatus.set(healthStatusValue);
  }

  /**
   * Update batch worker metrics
   */
  private updateBatchWorkerMetrics(): void {
    const batchMetrics = this.metricsCollector.getBatchWorkerMetrics();
    this.batchesProcessedTotal.set(batchMetrics.totalBatchesProcessed);
    this.eventsProcessedTotal.set(batchMetrics.totalEventsProcessed);
  }

  /**
   * Update business metrics
   */
  private async updateBusinessMetrics(): Promise<void> {
    try {
      const businessMetrics =
        await this.businessMetricsService.getBusinessMetrics();
      
      this.businessEventsTotal.set(businessMetrics.totalEvents);
      this.businessEventsLast24h.set(businessMetrics.eventsLast24Hours);
      this.businessEventsLastHour.set(businessMetrics.eventsLastHour);

      // Update events by service (with labels)
      this.businessEventsByService.reset();
      for (const [service, count] of Object.entries(
        businessMetrics.eventsByService,
      )) {
        this.businessEventsByService.set({ service }, count);
      }
    } catch (error) {
      // Business metrics might fail if DB is unavailable, that's OK
      this.logger.debug('Failed to update business metrics', error);
    }
  }

  /**
   * Update health metrics
   */
  private updateHealthMetrics(): void {
    const circuitMetrics = this.circuitBreaker.getMetrics();
    
    const circuitStateValue =
      circuitMetrics.state === CircuitState.CLOSED
        ? 0
        : circuitMetrics.state === CircuitState.OPEN
          ? 1
          : 2;
    this.circuitBreakerState.set(circuitStateValue);

    // Health status (assume healthy if we can get metrics)
    this.healthStatus.set(1);
    this.databaseConnectionStatus.set(
      circuitMetrics.state === CircuitState.CLOSED ? 1 : 0,
    );
  }

  /**
   * Record batch processed (for histogram metrics)
   * Called when a batch is processed to record timing metrics
   *
   * @param batchSize - Number of events in the batch
   * @param processingTimeMs - Total processing time in milliseconds
   * @param insertTimeMs - Database insert time in milliseconds
   */
  recordBatchProcessed(
    batchSize: number,
    processingTimeMs: number,
    insertTimeMs: number,
  ): void {
    this.batchProcessingTimeMs.observe(processingTimeMs);
    this.batchInsertTimeMs.observe(insertTimeMs);
  }

  /**
   * Get metrics in Prometheus format
   * @returns Prometheus metrics as string
   */
  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }
}
