export interface EnrichedEvent {
  eventId: string;
  timestamp: string;
  service: string;
  message: string;
  metadata?: Record<string, any>;
  ingestedAt: string;
  retryCount?: number;
}

