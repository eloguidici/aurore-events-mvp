import { Event } from '../../entities/event.entity';
import { BatchInsertResult } from './batch-insert-result.interface';
import { EnrichedEvent } from '../../services/interfaces/enriched-event.interface';

/**
 * Interface for event repository
 * Abstracts data access layer from business logic
 * Allows easy swapping of ORM implementations
 */
export interface IEventRepository {
  /**
   * Batch insert events to database
   *
   * @param events - Array of enriched events to insert (includes eventId)
   * @returns BatchInsertResult containing count of successful and failed insertions
   */
  batchInsert(events: EnrichedEvent[]): Promise<BatchInsertResult>;

  /**
   * Find events by service and time range with pagination and sorting
   *
   * @param params - Query parameters
   * @returns Array of Event entities
   */
  findByServiceAndTimeRange(params: {
    service: string;
    from: string;
    to: string;
    limit: number;
    offset: number;
    sortField: string;
    sortOrder: 'ASC' | 'DESC';
  }): Promise<Event[]>;

  /**
   * Count events by service and time range
   *
   * @param params - Query parameters
   * @returns Total count of matching events
   */
  countByServiceAndTimeRange(params: {
    service: string;
    from: string;
    to: string;
  }): Promise<number>;

  /**
   * Find events by service and time range with pagination, sorting, and total count
   * Optimized method that returns both events and total count in a single operation
   * Uses parallel queries for better performance and type safety
   *
   * @param params - Query parameters including pagination and sorting
   * @returns Object containing events array and total count
   */
  findByServiceAndTimeRangeWithCount(params: {
    service: string;
    from: string;
    to: string;
    limit: number;
    offset: number;
    sortField: string;
    sortOrder: 'ASC' | 'DESC';
  }): Promise<{ events: Event[]; total: number }>;

  /**
   * Delete events older than specified retention days
   *
   * @param retentionDays - Number of days to retain events
   * @returns Number of events deleted
   */
  deleteOldEvents(retentionDays: number): Promise<number>;
}
