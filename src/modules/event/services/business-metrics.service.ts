import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ErrorLogger } from '../../common/utils/error-logger';
import { Event } from '../entities/event.entity';

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
 * Type for service count query result
 * PostgreSQL COUNT() returns as string
 */
interface ServiceCountRow {
  service: string;
  count: string;
}

/**
 * Type for hourly count query result
 * PostgreSQL TO_CHAR returns as string
 */
interface HourlyCountRow {
  hour: string;
  count: string;
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
  private readonly CACHE_TTL_MS = 60000; // Cache for 1 minute

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
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
   * Get raw service count data for further processing
   *
   * @returns Array of service count rows
   * @private
   */
  private async getServiceCountRows(): Promise<ServiceCountRow[]> {
    return (await this.eventRepository
      .createQueryBuilder('event')
      .select('event.service', 'service')
      .addSelect('COUNT(*)', 'count')
      .groupBy('event.service')
      .getRawMany()) as ServiceCountRow[];
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
    const [eventsLast24Hours, eventsLastHour] = await Promise.all([
      this.eventRepository
        .createQueryBuilder('event')
        .where('event."createdAt" >= :last24Hours', { last24Hours })
        .getCount(),
      this.eventRepository
        .createQueryBuilder('event')
        .where('event."createdAt" >= :lastHour', { lastHour })
        .getCount(),
    ]);

    return { eventsLast24Hours, eventsLastHour };
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
    const eventsByHourRaw = (await this.eventRepository
      .createQueryBuilder('event')
      .select('TO_CHAR(event."createdAt", \'YYYY-MM-DD HH24:00\')', 'hour')
      .addSelect('COUNT(*)', 'count')
      .where('event."createdAt" >= :last24Hours', { last24Hours })
      .groupBy('hour')
      .orderBy('hour', 'ASC')
      .getRawMany()) as HourlyCountRow[];

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
      Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS
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
        this.eventRepository.count(),
        this.getServiceCountRows(),
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
      ErrorLogger.logError(
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
