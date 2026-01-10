/**
 * Enriched event interface
 * Represents an event after enrichment with metadata (eventId, ingestedAt, etc.)
 * Used throughout the service layer for event processing
 */
export interface EnrichedEvent {
  eventId: string;
  timestamp: string;
  service: string;
  message: string;
  metadata?: Record<string, any>;
  ingestedAt: string;
  retryCount?: number;
}
