import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';

import { CircuitBreakerService } from '../../common/services/circuit-breaker.service';
import { ErrorLogger } from '../../common/utils/error-logger';
import { CONFIG_TOKENS } from '../../config/tokens/config.tokens';
import { ValidationConfig } from '../../config/interfaces/validation-config.interface';
import { Event } from '../entities/event.entity';
import { BatchInsertResult } from './interfaces/batch-insert-result.interface';
import { EnrichedEvent } from '../services/interfaces/enriched-event.interface';
import { IEventRepository } from './interfaces/event.repository.interface';

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
    @Inject(CONFIG_TOKENS.VALIDATION)
    private readonly validationConfig: ValidationConfig,
  ) {}

  /**
   * Batch insert events to database using a transaction
   *
   * @param events - Array of enriched events to insert (includes eventId)
   * @returns Object containing count of successful and failed insertions
   */
  async batchInsert(events: EnrichedEvent[]): Promise<BatchInsertResult> {
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
          let failed = 0;

          const values = events.map((event) => {
            // TypeORM automatically handles JSONB serialization
            // No need to manually stringify - TypeORM does it for us
            // JSONB provides native PostgreSQL JSON support and validation
            return {
              id: randomUUID(), // Generate UUID for primary key
              eventId: event.eventId, // Preserve eventId from enriched event
              timestamp: event.timestamp,
              service: event.service,
              message: event.message,
              metadata: event.metadata || null, // JSONB type - TypeORM handles serialization
              ingestedAt: event.ingestedAt, // Use ingestedAt from enriched event
            };
          });

          // Insert in chunks to avoid database limits and improve reliability
          const chunkSize = this.validationConfig.batchChunkSize;
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
            } catch (chunkError: any) {
              // Check for duplicate eventId error (PostgreSQL unique constraint violation)
              const isDuplicateError =
                chunkError?.code === '23505' || // PostgreSQL unique violation
                chunkError?.message?.includes('duplicate key') ||
                chunkError?.message?.includes('UNIQUE constraint');

              // Update failed count for the chunk that failed
              failed += chunk.length;

              ErrorLogger.logError(
                this.logger,
                isDuplicateError
                  ? 'Failed to insert chunk: duplicate eventId detected'
                  : 'Failed to insert chunk',
                chunkError,
                {
                  chunkNumber: i / chunkSize + 1,
                  chunkSize: chunk.length,
                  totalChunks: Math.ceil(values.length / chunkSize),
                  isDuplicateError,
                },
              );
              // If any chunk fails, throw to rollback entire transaction
              throw chunkError;
            }
          }

          // Note: In a transaction, if any chunk fails, the entire transaction rolls back
          // So successful will be 0 and failed will be events.length if transaction fails
          // This return is only reached if all chunks succeed
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
   * Validate and sanitize sort field to prevent SQL injection
   * Only allows fields from ALLOWED_SORT_FIELDS
   *
   * @param sortField - Sort field to validate
   * @returns Validated sort field or default
   */
  private validateSortField(sortField: string): string {
    const ALLOWED_SORT_FIELDS = [
      'timestamp',
      'service',
      'message',
      'ingestedAt',
      'createdAt',
    ] as const;

    // Validate against allowed fields to prevent SQL injection
    if (ALLOWED_SORT_FIELDS.includes(sortField as any)) {
      return sortField;
    }

    // Default to timestamp if invalid
    this.logger.warn(`Invalid sortField: ${sortField}, defaulting to timestamp`);
    return 'timestamp';
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
      // Validate sort field to prevent SQL injection (double-check even though DTO validates)
      const safeSortField = this.validateSortField(params.sortField);

      // Add timeout protection for long-running queries
      const queryTimeout = 30000; // 30 seconds timeout
      const queryPromise = this.buildServiceAndTimeRangeQuery(
        params.service,
        params.from,
        params.to,
      )
        .orderBy(`event.${safeSortField}`, params.sortOrder)
        .limit(params.limit)
        .offset(params.offset)
        .getMany();

      // Race query against timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Query timeout exceeded')),
          queryTimeout,
        );
      });

      return await Promise.race([queryPromise, timeoutPromise]);
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
      // Validate sort field to prevent SQL injection (double-check even though DTO validates)
      const safeSortField = this.validateSortField(params.sortField);

      // Add timeout protection for long-running queries
      const queryTimeout = 30000; // 30 seconds timeout

      // Execute find and count queries in parallel for optimal performance
      const queryPromise = Promise.all([
        this.buildServiceAndTimeRangeQuery(
          params.service,
          params.from,
          params.to,
        )
          .orderBy(`event.${safeSortField}`, params.sortOrder)
          .limit(params.limit)
          .offset(params.offset)
          .getMany(),
        this.countByServiceAndTimeRange({
          service: params.service,
          from: params.from,
          to: params.to,
        }),
      ]);

      // Race query against timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Query timeout exceeded')),
          queryTimeout,
        );
      });

      const [events, total] = await Promise.race([
        queryPromise,
        timeoutPromise,
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
      // Calculate cutoff date in UTC
      // All timestamps are stored in UTC, so we use UTC for calculations
      const cutoffDate = new Date();
      cutoffDate.setUTCDate(cutoffDate.getUTCDate() - retentionDays);
      const cutoffIso = cutoffDate.toISOString(); // Always returns UTC format (ends with 'Z')

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
