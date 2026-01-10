import { EnrichedEvent } from './enriched-event.interface';

/**
 * Interface for Dead Letter Queue service
 */
export interface IDeadLetterQueueService {
  /**
   * Add event to Dead Letter Queue after all retries failed
   *
   * @param event - Event that permanently failed
   * @param failureReason - Reason why event failed
   * @param retryCount - Number of retry attempts made
   */
  addToDLQ(
    event: EnrichedEvent,
    failureReason: string,
    retryCount: number,
  ): Promise<void>;

  /**
   * List events in Dead Letter Queue
   *
   * @param options - Filter options
   * @returns Array of dead letter events
   */
  listDLQEvents(options?: {
    service?: string;
    reprocessed?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{
    events: Array<{
      id: string;
      eventId: string;
      service: string | null;
      failureReason: string;
      retryCount: number;
      lastAttemptAt: Date;
      reprocessed: boolean;
      createdAt: Date;
    }>;
    total: number;
  }>;

  /**
   * Get a specific dead letter event by ID
   *
   * @param id - Dead letter event ID
   * @returns Dead letter event or null
   */
  getDLQEventById(id: string): Promise<{
    id: string;
    eventId: string;
    originalEvent: EnrichedEvent;
    failureReason: string;
    retryCount: number;
    lastAttemptAt: Date;
    reprocessed: boolean;
    createdAt: Date;
  } | null>;

  /**
   * Reprocess a dead letter event (re-enqueue to buffer)
   *
   * @param id - Dead letter event ID
   * @returns true if successfully reprocessed, false otherwise
   */
  reprocessEvent(id: string): Promise<boolean>;

  /**
   * Delete a dead letter event permanently
   *
   * @param id - Dead letter event ID
   */
  deleteDLQEvent(id: string): Promise<void>;

  /**
   * Get statistics about Dead Letter Queue
   *
   * @returns DLQ statistics
   */
  getDLQStatistics(): Promise<{
    total: number;
    byService: Record<string, number>;
    reprocessed: number;
    pending: number;
    oldestEvent: Date | null;
  }>;
}
