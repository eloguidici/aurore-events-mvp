import { EnrichedEvent } from './enriched-event.interface';
import { MetricsDto } from '../dtos/metrics-response.dto';

/**
 * Interface for EventBufferService
 * Defines the contract for event buffering operations
 */
export interface IEventBufferService {
  /**
   * Enqueue an event to the buffer (non-blocking operation)
   * 
   * @param event - Enriched event to add to buffer
   * @returns true if event was enqueued, false if buffer is full
   */
  enqueue(event: EnrichedEvent): boolean;

  /**
   * Drain events from the buffer
   * Removes events from buffer and returns them for processing
   * 
   * @param batchSize - Maximum number of events to drain
   * @returns Array of events (up to batchSize), or empty array if buffer is empty
   */
  drain(batchSize: number): EnrichedEvent[];

  /**
   * Get current buffer size (number of events waiting to be processed)
   * 
   * @returns Current number of events in buffer
   */
  getSize(): number;

  /**
   * Get buffer metrics and statistics
   * 
   * @returns MetricsDto containing buffer metrics (size, capacity, utilization, etc.)
   */
  getMetrics(): MetricsDto;
}

