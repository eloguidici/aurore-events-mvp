import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CircuitBreakerService } from '../../common/services/circuit-breaker.service';
import { ErrorLogger } from '../../common/utils/error-logger';
import { envs } from '../../config/envs';
import { CreateEventDto } from '../dtos/create-event.dto';
import { Event } from '../entities/event.entity';
import { BatchInsertResult } from '../interfaces/batch-insert-result.interface';
import { IEventRepository } from './event.repository.interface';

/**
 * TypeORM implementation of EventRepository
 * Handles all database operations for events using TypeORM
 */
@Injectable()
export class TypeOrmEventRepository implements IEventRepository {
  private readonly logger = new Logger(TypeOrmEventRepository.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @Inject(CircuitBreakerService)
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  /**
   * Batch insert events to database using a transaction
   *
   * @param events - Array of events to insert
   * @returns Object containing count of successful and failed insertions
   */
  async batchInsert(events: CreateEventDto[]): Promise<BatchInsertResult> {
    if (events.length === 0) {
      return { successful: 0, failed: 0 };
    }

    // Execute with circuit breaker protection
    const operation = async () => {
      // Wrap entire batch in a single transaction for atomicity
      // If any chunk fails, entire transaction rolls back (all or nothing)
      return await this.eventRepository.manager.transaction(
        async (transactionalEntityManager) => {
          let successful = 0;
          const failed = 0;

          const values = events.map((event) => ({
            id: crypto.randomUUID(), // Generate UUID manually since .insert() doesn't auto-generate
            timestamp: event.timestamp,
            service: event.service,
            message: event.message,
            metadataJson: event.metadata
              ? JSON.stringify(event.metadata)
              : null,
            ingestedAt: new Date().toISOString(),
          }));

          // Insert in chunks to avoid database limits and improve reliability
          const chunkSize = envs.batchChunkSize;
          for (let i = 0; i < values.length; i += chunkSize) {
            const chunk = values.slice(i, i + chunkSize);

            try {
              await transactionalEntityManager
                .createQueryBuilder()
                .insert()
                .into(Event)
                .values(chunk)
                .execute();

              successful += chunk.length;
            } catch (chunkError) {
              ErrorLogger.logError(
                this.logger,
                'Failed to insert chunk',
                chunkError,
                {
                  chunkNumber: i / chunkSize + 1,
                  chunkSize: chunk.length,
                  totalChunks: Math.ceil(values.length / chunkSize),
                },
              );
              // If any chunk fails, throw to rollback entire transaction
              throw chunkError;
            }
          }

          return { successful, failed };
        },
      );
    };

    try {
      // Execute with circuit breaker protection
      return await this.circuitBreaker.execute(operation);
    } catch (error) {
      // Transaction rolled back - all events failed
      ErrorLogger.logError(
        this.logger,
        'Batch insert transaction failed',
        error,
        { eventsCount: events.length },
      );
      return { successful: 0, failed: events.length };
    }
  }

  /**
   * Build base query builder with service and time range filters
   * Reusable method to avoid code duplication
   *
   * @param service - Service name to filter
   * @param from - Start timestamp
   * @param to - End timestamp
   * @returns QueryBuilder with filters applied
   */
  private buildServiceAndTimeRangeQuery(
    service: string,
    from: string,
    to: string,
  ) {
    return this.eventRepository
      .createQueryBuilder('event')
      .where('event.service = :service', { service })
      .andWhere('event.timestamp >= :from', { from })
      .andWhere('event.timestamp <= :to', { to });
  }

  /**
   * Find events by service and time range with pagination and sorting
   * Optimized: Uses single query with window function for count (if supported)
   * Falls back to separate queries if window functions not available
   *
   * @param params - Query parameters
   * @returns Array of Event entities
   */
  async findByServiceAndTimeRange(params: {
    service: string;
    from: string;
    to: string;
    limit: number;
    offset: number;
    sortField: string;
    sortOrder: 'ASC' | 'DESC';
  }): Promise<Event[]> {
    // Execute with circuit breaker protection
    const operation = async () => {
      return await this.buildServiceAndTimeRangeQuery(
        params.service,
        params.from,
        params.to,
      )
        .orderBy(`event.${params.sortField}`, params.sortOrder)
        .limit(params.limit)
        .offset(params.offset)
        .getMany();
    };

    return await this.circuitBreaker.execute(operation);
  }

  /**
   * Count events by service and time range
   * Optimized: Uses circuit breaker protection
   *
   * @param params - Query parameters
   * @returns Total count of matching events
   */
  async countByServiceAndTimeRange(params: {
    service: string;
    from: string;
    to: string;
  }): Promise<number> {
    // Execute with circuit breaker protection
    const operation = async () => {
      return await this.buildServiceAndTimeRangeQuery(
        params.service,
        params.from,
        params.to,
      ).getCount();
    };

    return await this.circuitBreaker.execute(operation);
  }

  /**
   * Find events by service and time range with pagination, sorting, and total count
   * Optimized: Executes find and count queries in parallel for better performance
   * Protected by circuit breaker to prevent cascading failures
   *
   * @param params - Query parameters including pagination and sorting
   * @returns Object containing events array and total count
   */
  async findByServiceAndTimeRangeWithCount(params: {
    service: string;
    from: string;
    to: string;
    limit: number;
    offset: number;
    sortField: string;
    sortOrder: 'ASC' | 'DESC';
  }): Promise<{ events: Event[]; total: number }> {
    const operation = async () => {
      // Execute find and count queries in parallel for optimal performance
      const [events, total] = await Promise.all([
        this.buildServiceAndTimeRangeQuery(
          params.service,
          params.from,
          params.to,
        )
          .orderBy(`event.${params.sortField}`, params.sortOrder)
          .limit(params.limit)
          .offset(params.offset)
          .getMany(),
        this.countByServiceAndTimeRange({
          service: params.service,
          from: params.from,
          to: params.to,
        }),
      ]);

      return { events, total };
    };

    // Execute with circuit breaker protection
    return await this.circuitBreaker.execute(operation);
  }

  /**
   * Delete events older than specified retention days
   * Protected by circuit breaker to prevent cascading failures
   *
   * @param retentionDays - Number of days to retain events
   * @returns Number of events deleted
   */
  async deleteOldEvents(retentionDays: number): Promise<number> {
    const operation = async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffIso = cutoffDate.toISOString();

      const result = await this.eventRepository
        .createQueryBuilder()
        .delete()
        .from(Event)
        .where('timestamp < :cutoff', { cutoff: cutoffIso })
        .execute();

      return result.affected || 0;
    };

    // Execute with circuit breaker protection
    return await this.circuitBreaker.execute(operation);
  }
}
