import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../entities/event.entity';
import { ErrorLogger } from '../../common/utils/error-logger';

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

  onModuleInit() {
    this.logger.log('Business metrics service initialized');
  }

  /**
   * Get comprehensive business metrics
   * Cached for 1 minute to reduce database load
   * 
   * @returns BusinessMetrics object with various statistics
   */
  async getBusinessMetrics(): Promise<BusinessMetrics> {
    // Return cached metrics if still valid
    if (this.metricsCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.metricsCache;
    }

    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

      // Get total events count
      const totalEvents = await this.eventRepository.count();

      // Get events by service
      const eventsByServiceRaw = await this.eventRepository
        .createQueryBuilder('event')
        .select('event.service', 'service')
        .addSelect('COUNT(*)', 'count')
        .groupBy('event.service')
        .getRawMany() as ServiceCountRow[];

      const eventsByService: Record<string, number> = {};
      eventsByServiceRaw.forEach((row) => {
        eventsByService[row.service] = parseInt(row.count, 10);
      });

      // Get events in last 24 hours
      const eventsLast24Hours = await this.eventRepository
        .createQueryBuilder('event')
        .where('event."createdAt" >= :last24Hours', { last24Hours })
        .getCount();

      // Get events in last hour
      const eventsLastHour = await this.eventRepository
        .createQueryBuilder('event')
        .where('event."createdAt" >= :lastHour', { lastHour })
        .getCount();

      // Calculate average events per minute (last 24 hours)
      const averageEventsPerMinute = eventsLast24Hours > 0
        ? eventsLast24Hours / (24 * 60)
        : 0;

      // Get top 10 services by event count
      const topServices = eventsByServiceRaw
        .map((row) => ({
          service: row.service,
          count: parseInt(row.count, 10),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Get events by hour (last 24 hours)
      const eventsByHourRaw = await this.eventRepository
        .createQueryBuilder('event')
        .select("TO_CHAR(event.\"createdAt\", 'YYYY-MM-DD HH24:00')", 'hour')
        .addSelect('COUNT(*)', 'count')
        .where('event."createdAt" >= :last24Hours', { last24Hours })
        .groupBy('hour')
        .orderBy('hour', 'ASC')
        .getRawMany() as HourlyCountRow[];

      const eventsByHour = eventsByHourRaw.map((row) => ({
        hour: row.hour,
        count: parseInt(row.count, 10),
      }));

      this.metricsCache = {
        totalEvents,
        eventsByService,
        eventsLast24Hours,
        eventsLastHour,
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

