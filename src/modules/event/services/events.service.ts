import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';

import { ErrorLogger } from '../../common/utils/error-logger';
import { Sanitizer } from '../../common/utils/sanitizer';
import { CONFIG_TOKENS } from '../../config/tokens/config.tokens';
import { ServiceConfig } from '../../config/interfaces/service-config.interface';
import { QueryConfig } from '../../config/interfaces/query-config.interface';
import { DEFAULT_SORT_FIELD } from '../constants/query.constants';
import { CreateEventDto } from '../dtos/create-event.dto';
import { IngestResponseDto } from '../dtos/ingest-event-response.dto';
import { QueryDto } from '../dtos/query-events.dto';
import {
  EventDto,
  SearchResponseDto,
} from '../dtos/search-events-response.dto';
import { BufferSaturatedException } from '../exceptions';
import { BatchInsertResult } from '../repositories/interfaces/batch-insert-result.interface';
import { EnrichedEvent } from './interfaces/enriched-event.interface';
import { IEventService } from './interfaces/event-service.interface';
import { IEventRepository } from '../repositories/interfaces/event.repository.interface';
import { EVENT_REPOSITORY_TOKEN } from '../repositories/interfaces/event.repository.token';
import { EventBufferService } from './event-buffer.service';

@Injectable()
export class EventService implements IEventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    @Inject(EVENT_REPOSITORY_TOKEN)
    private readonly eventRepository: IEventRepository,
    private readonly eventBufferService: EventBufferService,
    @Inject(CONFIG_TOKENS.SERVICE)
    private readonly serviceConfig: ServiceConfig,
    @Inject(CONFIG_TOKENS.QUERY)
    private readonly queryConfig: QueryConfig,
  ) {}

  /**
   * Validate and normalize timestamp to ensure it's within reasonable range
   * Falls back to current time in UTC if timestamp is invalid
   * All timestamps are stored and processed in UTC
   *
   * @param timestamp - Timestamp string to validate (ISO 8601 format, UTC)
   * @returns Valid timestamp string in ISO 8601 format (UTC, e.g., '2024-01-15T10:30:00.000Z')
   * @private
   */
  private validateAndNormalizeTimestamp(timestamp: string): string {
    const timestampDate = new Date(timestamp);
    const minYear = 1970;
    const maxYear = 2100;

    if (
      isNaN(timestampDate.getTime()) ||
      timestampDate.getFullYear() < minYear ||
      timestampDate.getFullYear() > maxYear
    ) {
      this.logger.warn(
        `Timestamp out of reasonable range: ${timestamp}, using current time (UTC)`,
      );
      // toISOString() always returns UTC format (ends with 'Z')
      return new Date().toISOString();
    }

    // Ensure timestamp is in UTC format (ISO 8601 with 'Z' suffix)
    // If input is already valid, return as-is (assuming it's in UTC)
    return timestamp;
  }

  /**
   * Enriches event with metadata (ID and ingestion timestamp)
   * Sanitizes input to prevent XSS and injection attacks
   *
   * @param createEventDto - Event data to enrich
   * @returns EnrichedEvent with generated eventId and ingestedAt timestamp
   * @private
   */
  private enrich(createEventDto: CreateEventDto): EnrichedEvent {
    // Sanitize input to prevent XSS and injection attacks
    const sanitizedService = Sanitizer.sanitizeString(createEventDto.service);
    const sanitizedMessage = Sanitizer.sanitizeString(createEventDto.message);
    const sanitizedMetadata = createEventDto.metadata
      ? Sanitizer.sanitizeObject(createEventDto.metadata)
      : null;

    // Validate and normalize timestamp
    const normalizedTimestamp = this.validateAndNormalizeTimestamp(
      createEventDto.timestamp,
    );

    // Generate efficient event ID: use crypto.randomBytes for better performance than UUID
    // 6 bytes = 12 hex characters = sufficient uniqueness for event IDs
    // All timestamps are in UTC (ISO 8601 format ending with 'Z')
    return {
      eventId: `evt_${randomBytes(6).toString('hex')}`, // 12 hex chars, more efficient than UUID
      timestamp: normalizedTimestamp, // UTC timestamp (ISO 8601)
      service: sanitizedService,
      message: sanitizedMessage,
      metadata: sanitizedMetadata,
      ingestedAt: new Date().toISOString(), // UTC timestamp (ISO 8601, ends with 'Z')
    };
  }

  /**
   * Ingest a new event
   * Enriches event with metadata, checks buffer capacity, and enqueues to buffer
   *
   * @param createEventDto - Event data to ingest (validated by ValidationPipe)
   * @returns IngestResponseDto with event_id and queued_at timestamp
   * @throws BufferSaturatedException if buffer is full (429)
   */
  public async ingest(
    createEventDto: CreateEventDto,
  ): Promise<IngestResponseDto> {
    const enrichedEvent = this.enrich(createEventDto);

    // Atomic enqueue operation - eliminates race condition
    // Try to enqueue directly, if buffer is full, throw exception
    const enqueued = this.eventBufferService.enqueue(enrichedEvent);

    if (!enqueued) {
      // Buffer is full - apply backpressure
      // enqueue() already checked capacity, so if it returns false, buffer is definitely full
      throw new BufferSaturatedException(this.serviceConfig.retryAfterSeconds);
    }

    return new IngestResponseDto({
      eventId: enrichedEvent.eventId,
      queuedAt: enrichedEvent.ingestedAt,
    });
  }

  /**
   * Insert events to database in a single transaction
   *
   * @param events - Array of enriched events to insert (includes eventId)
   * @returns BatchInsertResult containing count of successful and failed insertions
   * @throws Logs error but does not throw - returns failed count instead
   */
  public async insert(events: EnrichedEvent[]): Promise<BatchInsertResult> {
    return await this.eventRepository.batchInsert(events);
  }

  /**
   * Search events by service and time range with pagination and sorting
   *
   * @param queryDto - Query parameters including service, time range, pagination, and sorting
   * @returns SearchResponseDto with paginated results
   * @throws Error if 'from' timestamp is not before 'to' timestamp
   */
  public async search(queryDto: QueryDto): Promise<SearchResponseDto> {
    // Extract variables outside try-catch for error logging context
    const {
      service,
      from,
      to,
      page,
      pageSize,
      sortField = DEFAULT_SORT_FIELD,
      sortOrder = 'DESC',
    } = queryDto;

    // All validations are handled in QueryDto via ValidationPipe:
    // - Time range: @IsValidTimeRange decorator
    // - sortField: @IsSortField decorator
    // - sortOrder: @IsSortOrder decorator
    // - page: @IsInt, @Min(1) decorators
    // - pageSize: @IsInt, @Min(1) decorators
    const safeSortField = sortField || DEFAULT_SORT_FIELD;
    const safeSortOrder = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    try {
      // Calculate pagination with validation
      const limit = Math.min(pageSize, this.queryConfig.maxLimit);
      const maxOffset = 10000 * limit; // Prevent excessive offsets (max page 10000)
      const calculatedOffset = (page - 1) * limit;
      const offset = Math.min(calculatedOffset, maxOffset);

      // Warn if offset was limited
      if (calculatedOffset > maxOffset) {
        this.logger.warn(
          `Offset limited from ${calculatedOffset} to ${maxOffset} (page ${page} exceeds maximum)`,
        );
      }

      // Use optimized method that returns events and total count in a single call
      // This method executes queries in parallel internally for optimal performance
      const { events, total } =
        await this.eventRepository.findByServiceAndTimeRangeWithCount({
          service,
          from,
          to,
          limit,
          offset,
          sortField: safeSortField,
          sortOrder: safeSortOrder,
        });

      // Convert events to EventDto with error handling
      const { items, filteredCount } = this.convertEventsToDto(events, service, page);

      // Adjust total to account for filtered corrupt events
      // This ensures pagination is consistent: total reflects only valid events
      // Note: This adjustment is per-page, so if there are corrupt events in other pages,
      // the total might still be slightly off, but it's better than including corrupt events
      const adjustedTotal = Math.max(0, total - filteredCount);

      return new SearchResponseDto({
        page,
        pageSize: limit,
        sortField: safeSortField,
        sortOrder: safeSortOrder,
        total: adjustedTotal,
        items,
      });
    } catch (error) {
      // Log error with standardized format and context
      ErrorLogger.logError(
        this.logger,
        'Error querying events',
        error,
        ErrorLogger.createContext(undefined, service, {
          from,
          to,
          page,
          pageSize,
          sortField: safeSortField,
          sortOrder: safeSortOrder,
        }),
      );
      // Re-throw to let controller handle it
      throw error;
    }
  }

  /**
   * Convert database events to EventDto with error handling
   * Filters out corrupt events that fail to convert
   *
   * @param events - Array of events from database
   * @param service - Service name for logging context
   * @param page - Page number for logging context
   * @returns Object with converted items and count of filtered events
   * @private
   */
  private convertEventsToDto(
    events: any[],
    service: string,
    page: number,
  ): { items: EventDto[]; filteredCount: number } {
    let filteredCount = 0;
    const items = events
      .map((event) => {
        try {
          return new EventDto(event);
        } catch (error) {
          // If EventDto construction fails, log and skip this event
          // This should be extremely rare but prevents one corrupt event from breaking the entire query
          filteredCount++;
          this.logger.warn(
            `Failed to convert event to DTO: ${event.id}`,
            error,
          );
          return null;
        }
      })
      .filter((item): item is EventDto => item !== null);

    // Log summary if any events were filtered
    if (filteredCount > 0) {
      this.logger.warn(
        `Filtered ${filteredCount} corrupt event(s) from query results (service: ${service}, page: ${page})`,
      );
    }

    return { items, filteredCount };
  }

  /**
   * Cleanup events older than retention period
   *
   * @param retentionDays - Number of days to retain events (events older than this are deleted)
   * @returns Number of events deleted
   */
  public async cleanup(retentionDays: number): Promise<number> {
    return await this.eventRepository.deleteOldEvents(retentionDays);
  }
}
