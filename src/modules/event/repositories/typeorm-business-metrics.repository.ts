import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IErrorLoggerService } from '../../common/services/interfaces/error-logger-service.interface';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../../common/services/interfaces/error-logger-service.token';
import { Event } from '../entities/event.entity';
import {
  HourlyCountRow,
  IBusinessMetricsRepository,
  ServiceCountRow,
} from './interfaces/business-metrics.repository.interface';

/**
 * TypeORM implementation of BusinessMetricsRepository
 * Handles all database queries for business metrics using TypeORM
 */
@Injectable()
export class TypeOrmBusinessMetricsRepository implements IBusinessMetricsRepository {
  private readonly logger = new Logger(TypeOrmBusinessMetricsRepository.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @Inject(ERROR_LOGGER_SERVICE_TOKEN)
    private readonly errorLogger: IErrorLoggerService,
  ) {}

  /**
   * Get total count of events in the database
   *
   * @returns Total number of events
   */
  async getTotalEventsCount(): Promise<number> {
    try {
      return await this.eventRepository.count();
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to get total events count',
        error,
      );
      throw error;
    }
  }

  /**
   * Get event counts grouped by service
   *
   * @returns Array of service count rows
   */
  async getEventsByService(): Promise<ServiceCountRow[]> {
    try {
      return (await this.eventRepository
        .createQueryBuilder('event')
        .select('event.service', 'service')
        .addSelect('COUNT(*)', 'count')
        .groupBy('event.service')
        .getRawMany()) as ServiceCountRow[];
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to get events by service',
        error,
      );
      throw error;
    }
  }

  /**
   * Get event counts for different time ranges
   *
   * @param last24Hours - Date representing 24 hours ago
   * @param lastHour - Date representing 1 hour ago
   * @returns Object with counts for last 24 hours and last hour
   */
  async getEventsByTimeRange(
    last24Hours: Date,
    lastHour: Date,
  ): Promise<{
    eventsLast24Hours: number;
    eventsLastHour: number;
  }> {
    try {
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
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to get events by time range',
        error,
      );
      throw error;
    }
  }

  /**
   * Get events grouped by hour for the last 24 hours
   *
   * @param last24Hours - Date representing 24 hours ago
   * @returns Array of hourly event counts
   */
  async getEventsByHour(last24Hours: Date): Promise<HourlyCountRow[]> {
    try {
      return (await this.eventRepository
        .createQueryBuilder('event')
        .select('TO_CHAR(event."createdAt", \'YYYY-MM-DD HH24:00\')', 'hour')
        .addSelect('COUNT(*)', 'count')
        .where('event."createdAt" >= :last24Hours', { last24Hours })
        .groupBy('hour')
        .orderBy('hour', 'ASC')
        .getRawMany()) as HourlyCountRow[];
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to get events by hour',
        error,
      );
      throw error;
    }
  }
}
