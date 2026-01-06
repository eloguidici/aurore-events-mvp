import { Injectable, Logger, Inject } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { envs } from '../../config/envs';
import { CreateEventDto } from '../dtos/create-event.dto';
import { QueryDto } from '../dtos/query-events.dto';
import { EnrichedEvent } from '../interfaces/enriched-event.interface';
import { EventBufferService } from './event-buffer.service';
import { BufferSaturatedException } from '../exceptions';
import {
  EventDto,
  SearchResponseDto,
} from '../dtos/search-events-response.dto';
import { IngestResponseDto } from '../dtos/ingest-event-response.dto';
import { IEventRepository } from '../repositories/event.repository.interface';
import { BatchInsertResult } from '../interfaces/batch-insert-result.interface';
import { IEventService } from '../interfaces/event-service.interface';
import { EVENT_REPOSITORY_TOKEN } from '../repositories/event.repository.token';
import { DEFAULT_SORT_FIELD } from '../constants/query.constants';
import { ErrorLogger } from '../../common/utils/error-logger';
import { Sanitizer } from '../../common/utils/sanitizer';

@Injectable()
export class EventService implements IEventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    @Inject(EVENT_REPOSITORY_TOKEN)
    private readonly eventRepository: IEventRepository,
    private readonly eventBufferService: EventBufferService,
  ) {}

  /**
   * Enriches event with metadata (ID and ingestion timestamp)
   * Sanitizes input to prevent XSS and injection attacks
   *
   * @param createEventDto - Event data to enrich
   * @returns EnrichedEvent with generated eventId and ingestedAt timestamp
   */
  private enrich(createEventDto: CreateEventDto): EnrichedEvent {
    // Sanitize input to prevent XSS and injection attacks
    const sanitizedService = Sanitizer.sanitizeString(createEventDto.service);
    const sanitizedMessage = Sanitizer.sanitizeString(createEventDto.message);
    const sanitizedMetadata = createEventDto.metadata
      ? Sanitizer.sanitizeObject(createEventDto.metadata)
      : null;

    // Generate efficient event ID: use crypto.randomBytes for better performance than UUID
    // 6 bytes = 12 hex characters = sufficient uniqueness for event IDs
    return {
      eventId: `evt_${randomBytes(6).toString('hex')}`, // 12 hex chars, more efficient than UUID
      timestamp: createEventDto.timestamp,
      service: sanitizedService,
      message: sanitizedMessage,
      metadata: sanitizedMetadata,
      ingestedAt: new Date().toISOString(),
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
      throw new BufferSaturatedException(envs.retryAfterSeconds);
    }

    return new IngestResponseDto({
      eventId: enrichedEvent.eventId,
      queuedAt: enrichedEvent.ingestedAt,
    });
  }

  /**
   * Insert events to database in a single transaction
   *
   * @param events - Array of events to insert
   * @returns BatchInsertResult containing count of successful and failed insertions
   * @throws Logs error but does not throw - returns failed count instead
   */
  public async insert(events: CreateEventDto[]): Promise<BatchInsertResult> {
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
      // Calculate pagination
      const limit = Math.min(pageSize, envs.maxQueryLimit);
      const offset = (page - 1) * limit;

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

      // Convert events to EventDto
      const items = events.map((event) => new EventDto(event));

      return new SearchResponseDto({
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
   * Cleanup events older than retention period
   *
   * @param retentionDays - Number of days to retain events (events older than this are deleted)
   * @returns Number of events deleted
   */
  public async cleanup(retentionDays: number): Promise<number> {
    return await this.eventRepository.deleteOldEvents(retentionDays);
  }
}
