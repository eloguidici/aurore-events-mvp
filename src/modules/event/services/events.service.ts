import { Injectable, Logger, Inject } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { envs } from '../../config/envs';
import { CreateEventDto } from '../dtos/create-event.dto';
import { QueryEventsDto } from '../dtos/query-events.dto';
import { EnrichedEvent } from '../interfaces/enriched-event.interface';
import { EventBufferService } from './event-buffer.service';
import {
  BufferSaturatedException,
  ServiceUnavailableException,
} from '../exceptions';
import { EventResponseDto, SearchEventsResponseDto } from '../dtos/search-events-response.dto';
import { IngestEventResponseDto } from '../dtos/ingest-event-response.dto';
import { IEventRepository } from '../repositories/event.repository.interface';
import { BatchInsertResult } from '../interfaces/batch-insert-result.interface';
import { EVENT_REPOSITORY_TOKEN } from '../repositories/event.repository.token';
import {
  DEFAULT_SORT_FIELD,
  ALLOWED_SORT_FIELDS,
} from '../constants/query.constants';
import { ErrorLogger } from '../../common/utils/error-logger';
import { isPositiveInteger, isNonEmptyString } from '../../common/utils/type-guards';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @Inject(EVENT_REPOSITORY_TOKEN)
    private readonly eventRepository: IEventRepository,
    private readonly eventBufferService: EventBufferService,
  ) {}

  /**
   * Ingest a new event
   * Enriches event with metadata, checks buffer capacity, and enqueues to buffer
   * 
   * @param createEventDto - Event data to ingest
   * @returns IngestEventResponseDto with event_id and queued_at timestamp
   * @throws BufferSaturatedException if buffer is full (429)
   * @throws ServiceUnavailableException if system is under pressure (503)
   */
  ingestEvent(createEventDto: CreateEventDto): IngestEventResponseDto {
    // Validate input types (defense in depth)
    if (!isNonEmptyString(createEventDto.service)) {
      throw new Error('Service must be a non-empty string');
    }
    if (!isNonEmptyString(createEventDto.message)) {
      throw new Error('Message must be a non-empty string');
    }

    // Enrich event with metadata
    // Generate efficient event ID: use crypto.randomBytes for better performance than UUID
    // 6 bytes = 12 hex characters = sufficient uniqueness for event IDs
    const enrichedEvent: EnrichedEvent = {
      eventId: `evt_${randomBytes(6).toString('hex')}`, // 12 hex chars, more efficient than UUID
      timestamp: createEventDto.timestamp,
      service: createEventDto.service,
      message: createEventDto.message,
      metadata: createEventDto.metadata,
      ingestedAt: new Date().toISOString(),
    };

    // Atomic enqueue operation - eliminates race condition
    // Try to enqueue directly, if buffer is full, throw exception
    const enqueued = this.eventBufferService.enqueue(enrichedEvent);

    if (!enqueued) {
      // Buffer is full - apply backpressure
      // enqueue() already checked capacity, so if it returns false, buffer is definitely full
      throw new BufferSaturatedException(envs.retryAfterSeconds);
    }

    return new IngestEventResponseDto({
      eventId: enrichedEvent.eventId,
      queuedAt: enrichedEvent.ingestedAt,
    });
  }

  /**
   * Batch insert events to database using a transaction
   * 
   * @param events - Array of events to insert
   * @returns BatchInsertResult containing count of successful and failed insertions
   * @throws Logs error but does not throw - returns failed count instead
   */
  async batchInsert(events: CreateEventDto[]): Promise<BatchInsertResult> {
    return await this.eventRepository.batchInsert(events);
  }

  /**
   * Query events by service and time range with pagination and sorting
   * 
   * @param queryDto - Query parameters including service, time range, pagination, and sorting
   * @returns SearchEventsResponseDto with paginated results
   * @throws Error if 'from' timestamp is not before 'to' timestamp
   */
  async queryEvents(queryDto: QueryEventsDto): Promise<SearchEventsResponseDto> {
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

    // Time range validation is now handled in QueryEventsDto via @IsValidTimeRange decorator

    // sortField is already validated in DTO via @IsSortField decorator
    // Trust DTO validation for performance (defense in depth removed for efficiency)
    // If DTO validation somehow fails, TypeORM will handle it safely
    const safeSortField = sortField || DEFAULT_SORT_FIELD;
    const safeSortOrder = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    try {
      // Validate pagination parameters with type guards
      if (!isPositiveInteger(page)) {
        throw new Error(`Invalid page parameter: ${page}`);
      }
      if (!isPositiveInteger(pageSize)) {
        throw new Error(`Invalid pageSize parameter: ${pageSize}`);
      }

      // Calculate pagination
      const limit = Math.min(pageSize, envs.maxQueryLimit);
      const offset = (page - 1) * limit;

      // Use optimized method that returns events and total count in a single call
      // This method executes queries in parallel internally for optimal performance
      const { events, total } = await this.eventRepository.findByServiceAndTimeRangeWithCount({
        service,
        from,
        to,
        limit,
        offset,
        sortField: safeSortField,
        sortOrder: safeSortOrder,
      });

      // Convert events to EventResponseDto
      const items = events.map((event) => new EventResponseDto(event));

      return new SearchEventsResponseDto({
        page,
        pageSize: limit,
        sortField: safeSortField,
        sortOrder: safeSortOrder,
        total,
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
   * Delete events older than specified retention days
   * 
   * @param retentionDays - Number of days to retain events (events older than this are deleted)
   * @returns Number of events deleted
   */
  async deleteOldEvents(retentionDays: number): Promise<number> {
    return await this.eventRepository.deleteOldEvents(retentionDays);
  }
}

