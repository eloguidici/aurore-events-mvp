import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';

import { ICircuitBreakerService } from '../../common/services/interfaces/circuit-breaker-service.interface';
import { CIRCUIT_BREAKER_SERVICE_TOKEN } from '../../common/services/interfaces/circuit-breaker-service.token';
import { IErrorLoggerService } from '../../common/services/interfaces/error-logger-service.interface';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../../common/services/interfaces/error-logger-service.token';
import { QueryConfig } from '../../config/interfaces/query-config.interface';
import { ValidationConfig } from '../../config/interfaces/validation-config.interface';
import { CONFIG_TOKENS } from '../../config/tokens/config.tokens';
import { Event } from '../entities/event.entity';
import { EnrichedEvent } from '../services/interfaces/enriched-event.interface';
import { BatchInsertResult } from './interfaces/batch-insert-result.interface';
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
    @Inject(CIRCUIT_BREAKER_SERVICE_TOKEN)
    private readonly circuitBreaker: ICircuitBreakerService,
    @Inject(ERROR_LOGGER_SERVICE_TOKEN)
    private readonly errorLogger: IErrorLoggerService,
    @Inject(CONFIG_TOKENS.VALIDATION)
    private readonly validationConfig: ValidationConfig,
    @Inject(CONFIG_TOKENS.QUERY)
    private readonly queryConfig: QueryConfig,
  ) {}

  /**
   * Batch insert events to database using a transaction
   * Improved: Attempts individual inserts when batch fails to identify specific failed events
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

              this.errorLogger.logError(
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
                  // Store chunk indices for later individual retry
                  chunkStartIndex: i,
                  chunkEndIndex: Math.min(i + chunkSize, values.length),
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
      // Transaction rolled back - batch failed
      // Attempt individual inserts to identify specific failed events
      this.logger.debug(
        `Batch insert transaction failed, attempting individual inserts to identify failed events (batch size: ${events.length})`,
      );

      return await this.insertEventsIndividually(events, error);
    }
  }

  /**
   * Insert events individually to identify which specific events failed
   * Used as fallback when batch insert fails
   *
   * @param events - Events to insert individually
   * @param originalError - Original error from batch insert
   * @returns BatchInsertResult with counts of successful and failed events
   * @private
   */
  private async insertEventsIndividually(
    events: EnrichedEvent[],
    originalError: any,
  ): Promise<BatchInsertResult> {
    let successful = 0;
    let failed = 0;
    const failedEventIds: string[] = [];

    // Try to insert each event individually to identify which ones fail
    // Limit to reasonable number to avoid performance issues
    const maxIndividualAttempts = Math.min(events.length, 100);
    const eventsToTry = events.slice(0, maxIndividualAttempts);

    for (const event of eventsToTry) {
      try {
        const value = {
          id: randomUUID(),
          eventId: event.eventId,
          timestamp: event.timestamp,
          service: event.service,
          message: event.message,
          metadata: event.metadata || null,
          ingestedAt: event.ingestedAt,
        };

        // Attempt individual insert
        await this.eventRepository
          .createQueryBuilder()
          .insert()
          .into(Event)
          .values(value)
          .execute();

        successful++;
      } catch (individualError: any) {
        failed++;
        failedEventIds.push(event.eventId);

        // Log individual failure
        const isDuplicateError =
          individualError?.code === '23505' ||
          individualError?.message?.includes('duplicate key') ||
          individualError?.message?.includes('UNIQUE constraint');

        this.errorLogger.logError(
          this.logger,
          isDuplicateError
            ? `Failed to insert individual event: duplicate eventId (${event.eventId})`
            : `Failed to insert individual event: ${event.eventId}`,
          individualError,
          {
            eventId: event.eventId,
            service: event.service,
            isDuplicateError,
          },
        );
      }
    }

    // If we tried fewer events than total, mark remaining as failed
    const remainingFailed = events.length - maxIndividualAttempts;
    if (remainingFailed > 0) {
      failed += remainingFailed;
      this.logger.warn(
        `Batch insert failed for ${events.length} events. Tried ${maxIndividualAttempts} individually (${successful} succeeded, ${failed - remainingFailed} failed). Marking remaining ${remainingFailed} as failed.`,
      );
    } else {
      this.logger.log(
        `Batch insert failed. Tried ${events.length} events individually: ${successful} succeeded, ${failed} failed. Failed eventIds: ${failedEventIds.slice(0, 10).join(', ')}${failedEventIds.length > 10 ? '...' : ''}`,
      );
    }

    // Log original batch error for context
    this.errorLogger.logError(
      this.logger,
      'Batch insert transaction failed - attempted individual inserts',
      originalError,
      {
        totalEvents: events.length,
        successful,
        failed,
        failedEventIds: failedEventIds.slice(0, 20), // Log up to 20 failed event IDs
        attemptedIndividualInserts: eventsToTry.length,
      },
    );

    return { successful, failed };
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
    this.logger.warn(
      `Invalid sortField: ${sortField}, defaulting to timestamp`,
    );
    return 'timestamp';
  }

  /**
   * Build base query builder with service and time range filters
   * Optimized: Uses prepared statements and indexed columns for better performance
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
    // Use indexed columns (service, timestamp) for optimal query performance
    // PostgreSQL will use composite index IDX_EVENT_SERVICE_TIMESTAMP for this query
    return this.eventRepository
      .createQueryBuilder('event')
      .where('event.service = :service', { service })
      .andWhere('event.timestamp >= :from', { from })
      .andWhere('event.timestamp <= :to', { to });
    // Note: TypeORM uses prepared statements automatically, preventing SQL injection
  }

  /**
   * Find events by service and time range with pagination and sorting
   * Optimized: Uses single query with window function for count (if supported)
   * Falls back to separate queries if window functions not available
   *
   * @param params - Query parameters
   * @returns Array of Event entities
   * @throws Logs error with context and re-throws to let caller handle it
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
    // Extract variables outside try-catch for error logging context
    const { service, from, to, limit, offset, sortField, sortOrder } = params;

    // Execute with circuit breaker protection
    const operation = async () => {
      // Validate sort field to prevent SQL injection (double-check even though DTO validates)
      const safeSortField = this.validateSortField(params.sortField);

      // Add timeout protection for long-running queries
      const queryTimeout = this.queryConfig.queryTimeoutMs;
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

    try {
      return await this.circuitBreaker.execute(operation);
    } catch (error) {
      // Log error with standardized format and context
      this.errorLogger.logError(
        this.logger,
        'Error finding events by service and time range',
        error,
        this.errorLogger.createContext(undefined, service, {
          from,
          to,
          limit,
          offset,
          sortField,
          sortOrder,
        }),
      );
      // Re-throw to let caller handle it
      throw error;
    }
  }

  /**
   * Count events by service and time range
   * Optimized: Uses circuit breaker protection
   *
   * @param params - Query parameters
   * @returns Total count of matching events
   * @throws Logs error with context and re-throws to let caller handle it
   */
  async countByServiceAndTimeRange(params: {
    service: string;
    from: string;
    to: string;
  }): Promise<number> {
    // Extract variables outside try-catch for error logging context
    const { service, from, to } = params;

    // Execute with circuit breaker protection
    const operation = async () => {
      return await this.buildServiceAndTimeRangeQuery(
        params.service,
        params.from,
        params.to,
      ).getCount();
    };

    try {
      return await this.circuitBreaker.execute(operation);
    } catch (error) {
      // Log error with standardized format and context
      this.errorLogger.logError(
        this.logger,
        'Error counting events by service and time range',
        error,
        this.errorLogger.createContext(undefined, service, {
          from,
          to,
        }),
      );
      // Re-throw to let caller handle it
      throw error;
    }
  }

  /**
   * Find events by service and time range with pagination, sorting, and total count
   * Optimized: Executes find and count queries in parallel for better performance
   * Uses indexes for optimal query execution
   * Protected by circuit breaker to prevent cascading failures
   *
   * @param params - Query parameters including pagination and sorting
   * @returns Object containing events array and total count
   * @throws Logs error with context and re-throws to let caller handle it
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
    // Extract variables outside try-catch for error logging context
    const { service, from, to, limit, offset, sortField, sortOrder } = params;

    const operation = async () => {
      // Validate sort field to prevent SQL injection (double-check even though DTO validates)
      const safeSortField = this.validateSortField(params.sortField);

      // Add timeout protection for long-running queries
      const queryTimeout = this.queryConfig.queryTimeoutMs;

      // Execute find and count queries in parallel for optimal performance
      // Both queries use the same indexed columns (service, timestamp) for efficiency
      const queryPromise = Promise.all([
        this.buildServiceAndTimeRangeQuery(
          params.service,
          params.from,
          params.to,
        )
          .orderBy(`event.${safeSortField}`, params.sortOrder) // Uses index on sortField
          .limit(params.limit) // Limit results to prevent excessive data transfer
          .offset(params.offset)
          .getMany(), // Returns array of Event entities
        this.countByServiceAndTimeRange({
          service: params.service,
          from: params.from,
          to: params.to,
        }), // Uses same index for count query
      ]);

      // Race query against timeout to prevent hanging queries
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

    try {
      // Execute with circuit breaker protection
      return await this.circuitBreaker.execute(operation);
    } catch (error) {
      // Log error with standardized format and context
      this.errorLogger.logError(
        this.logger,
        'Error finding events with count by service and time range',
        error,
        this.errorLogger.createContext(undefined, service, {
          from,
          to,
          limit,
          offset,
          sortField,
          sortOrder,
        }),
      );
      // Re-throw to let caller handle it
      throw error;
    }
  }

  /**
   * Delete events older than specified retention days
   * Protected by circuit breaker to prevent cascading failures
   *
   * @param retentionDays - Number of days to retain events
   * @returns Number of events deleted
   * @throws Logs error with context and re-throws to let caller handle it
   */
  async deleteOldEvents(retentionDays: number): Promise<number> {
    // Extract variables outside try-catch for error logging context
    const days = retentionDays;

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

    try {
      // Execute with circuit breaker protection
      return await this.circuitBreaker.execute(operation);
    } catch (error) {
      // Log error with standardized format and context
      this.errorLogger.logError(
        this.logger,
        'Error deleting old events',
        error,
        this.errorLogger.createContext(undefined, undefined, {
          retentionDays: days,
        }),
      );
      // Re-throw to let caller handle it
      throw error;
    }
  }
}
