import { CreateEventDto } from '../dtos/create-event.dto';
import { QueryDto } from '../dtos/query-events.dto';
import { IngestResponseDto } from '../dtos/ingest-event-response.dto';
import { SearchResponseDto } from '../dtos/search-events-response.dto';
import { BatchInsertResult } from './batch-insert-result.interface';

/**
 * Interface for EventService
 * Defines the contract for event ingestion, querying, and cleanup operations
 */
export interface IEventService {
  /**
   * Ingest a new event
   * Enriches event with metadata and enqueues to buffer
   *
   * @param createEventDto - Event data to ingest
   * @returns IngestResponseDto with event_id and queued_at timestamp
   */
  ingest(createEventDto: CreateEventDto): Promise<IngestResponseDto>;

  /**
   * Insert events to database in a single transaction
   *
   * @param events - Array of events to insert
   * @returns BatchInsertResult containing count of successful and failed insertions
   */
  insert(events: CreateEventDto[]): Promise<BatchInsertResult>;

  /**
   * Search events by service and time range with pagination and sorting
   *
   * @param queryDto - Query parameters including service, time range, pagination, and sorting
   * @returns SearchResponseDto with paginated results
   */
  search(queryDto: QueryDto): Promise<SearchResponseDto>;

  /**
   * Cleanup events older than retention period
   *
   * @param retentionDays - Number of days to retain events (events older than this are deleted)
   * @returns Number of events deleted
   */
  cleanup(retentionDays: number): Promise<number>;
}
