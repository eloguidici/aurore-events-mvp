import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { IErrorLoggerService } from '../../common/services/interfaces/error-logger-service.interface';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../../common/services/interfaces/error-logger-service.token';
import { CONFIG_TOKENS } from '../../config/tokens/config.tokens';
import { MetricsConfig } from '../../config/interfaces/metrics-config.interface';
import {
  HourlyCountRow,
  IBusinessMetricsRepository,
  ServiceCountRow,
} from '../repositories/interfaces/business-metrics.repository.interface';
import { BUSINESS_METRICS_REPOSITORY_TOKEN } from '../repositories/interfaces/business-metrics.repository.token';

/**
 * Business metrics interface
 */
export interface BusinessMetrics {
  totalEvents: number;
  eventsByService: Record<string, number>;
  eventsLast24Hours: number;
  eventsLastHour: number;
  averageEventsPerMinute: number;
  topServices: Array<{ service: string; count: number }>;
  eventsByHour: Array<{ hour: string; count: number }>;
}

/**
 * Service for tracking business metrics
 * Provides insights into event patterns, service usage, and trends
 */
@Injectable()
export class BusinessMetricsService implements OnModuleInit {
  private readonly logger = new Logger(BusinessMetricsService.name);
  private metricsCache: BusinessMetrics | null = null;
  private cacheTimestamp: number = 0;

  constructor(
    @Inject(BUSINESS_METRICS_REPOSITORY_TOKEN)
    private readonly businessMetricsRepository: IBusinessMetricsRepository,
    @Inject(ERROR_LOGGER_SERVICE_TOKEN)
    private readonly errorLogger: IErrorLoggerService,
    @Inject(CONFIG_TOKENS.METRICS)
    private readonly metricsConfig: MetricsConfig,
  ) {}

  /**
   * Initialize business metrics service when module starts
   * Sets up logging for service initialization
   */
  onModuleInit() {
    this.logger.log('Business metrics service initialized');
  }

  /**
   * Convert service count rows to a record mapping service names to counts
   *
   * @param serviceCountRows - Raw service count data
   * @returns Record mapping service names to event counts
   * @private
   */
  private convertServiceCountsToRecord(
    serviceCountRows: ServiceCountRow[],
  ): Record<string, number> {
    const eventsByService: Record<string, number> = {};
    serviceCountRows.forEach((row) => {
      eventsByService[row.service] = parseInt(row.count, 10);
    });
    return eventsByService;
  }

  /**
   * Get event counts for different time ranges
   *
   * @param last24Hours - Date representing 24 hours ago
   * @param lastHour - Date representing 1 hour ago
   * @returns Object with counts for last 24 hours and last hour
   * @private
   */
  private async getTimeRangeCounts(last24Hours: Date, lastHour: Date): Promise<{
    eventsLast24Hours: number;
    eventsLastHour: number;
  }> {
    return await this.businessMetricsRepository.getEventsByTimeRange(
      last24Hours,
      lastHour,
    );
  }

  /**
   * Get top N services by event count
   *
   * @param serviceCountRows - Raw service count data
   * @param limit - Number of top services to return (default: 10)
   * @returns Array of top services sorted by count
   * @private
   */
  private getTopServices(
    serviceCountRows: ServiceCountRow[],
    limit: number = 10,
  ): Array<{ service: string; count: number }> {
    return serviceCountRows
      .map((row) => ({
        service: row.service,
        count: parseInt(row.count, 10),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get events grouped by hour for the last 24 hours
   *
   * @param last24Hours - Date representing 24 hours ago
   * @returns Array of hourly event counts
   * @private
   */
  private async getEventsByHour(
    last24Hours: Date,
  ): Promise<Array<{ hour: string; count: number }>> {
    const eventsByHourRaw =
      await this.businessMetricsRepository.getEventsByHour(last24Hours);

    return eventsByHourRaw.map((row) => ({
      hour: row.hour,
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Get comprehensive business metrics
   * Cached for 1 minute to reduce database load
   *
   * @returns BusinessMetrics object with various statistics
   */
  async getBusinessMetrics(): Promise<BusinessMetrics> {
    // Return cached metrics if still valid
    if (
      this.metricsCache &&
      Date.now() - this.cacheTimestamp < this.metricsConfig.cacheTtlMs
    ) {
      return this.metricsCache;
    }

    try {
      // All date calculations use UTC
      // new Date() creates a date in local timezone, but we compare with UTC timestamps in DB
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

      // Execute queries in parallel for better performance
      const [
        totalEvents,
        serviceCountRows,
        timeRangeCounts,
        eventsByHour,
      ] = await Promise.all([
        this.businessMetricsRepository.getTotalEventsCount(),
        this.businessMetricsRepository.getEventsByService(),
        this.getTimeRangeCounts(last24Hours, lastHour),
        this.getEventsByHour(last24Hours),
      ]);

      // Process service data
      const eventsByService = this.convertServiceCountsToRecord(serviceCountRows);
      const topServices = this.getTopServices(serviceCountRows);

      // Calculate average events per minute (last 24 hours)
      const averageEventsPerMinute =
        timeRangeCounts.eventsLast24Hours > 0
          ? timeRangeCounts.eventsLast24Hours / (24 * 60)
          : 0;

      this.metricsCache = {
        totalEvents,
        eventsByService,
        eventsLast24Hours: timeRangeCounts.eventsLast24Hours,
        eventsLastHour: timeRangeCounts.eventsLastHour,
        averageEventsPerMinute: Math.round(averageEventsPerMinute * 100) / 100,
        topServices,
        eventsByHour,
      };

      this.cacheTimestamp = Date.now();

      return this.metricsCache;
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to calculate business metrics',
        error,
      );
      // Return cached metrics if available, otherwise return empty metrics
      return this.metricsCache || this.getEmptyMetrics();
    }
  }

  /**
   * Get empty metrics structure
   * Used as fallback when metrics calculation fails
   *
   * @returns Empty BusinessMetrics object with zero values
   * @private
   */
  private getEmptyMetrics(): BusinessMetrics {
    return {
      totalEvents: 0,
      eventsByService: {},
      eventsLast24Hours: 0,
      eventsLastHour: 0,
      averageEventsPerMinute: 0,
      topServices: [],
      eventsByHour: [],
    };
  }

  /**
   * Invalidate metrics cache
   * Call this after significant events (e.g., bulk imports)
   */
  invalidateCache(): void {
    this.metricsCache = null;
    this.cacheTimestamp = 0;
    this.logger.debug('Business metrics cache invalidated');
  }
}
