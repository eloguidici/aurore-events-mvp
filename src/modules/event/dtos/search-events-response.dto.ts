import { Logger } from '@nestjs/common';
import { Event } from '../entities/event.entity';

/**
 * DTO for event response
 * Maps Event entity to response format with parsed metadata
 */
export class EventDto {
  private static readonly logger = new Logger(EventDto.name);

  id: string;
  eventId: string;
  timestamp: string;
  service: string;
  message: string;
  metadata: Record<string, any> | null;
  ingestedAt: string;
  createdAt: Date;

  /**
   * Creates EventDto from Event entity
   * Safely parses metadata JSON with error handling
   *
   * @param event - Event entity to convert
   */
  constructor(event: Event) {
    this.id = event.id;
    this.eventId = event.eventId;
    this.timestamp = event.timestamp;
    this.service = event.service;
    this.message = event.message;
    
    // Safely parse metadata JSON with error handling
    if (event.metadataJson) {
      try {
        this.metadata = JSON.parse(event.metadataJson);
      } catch (error) {
        // Log warning but continue - don't fail entire query for one corrupt event
        EventDto.logger.warn(
          `Failed to parse metadata JSON for event ${event.id}: ${error.message}`,
          { eventId: event.id, service: event.service },
        );
        this.metadata = null;
      }
    } else {
      this.metadata = null;
    }
    
    this.ingestedAt = event.ingestedAt;
    this.createdAt = event.createdAt;
  }
}

/**
 * DTO for search events response
 * Contains paginated results with sorting information
 */
export class SearchResponseDto {
  page: number;
  pageSize: number;
  sortField: string;
  sortOrder: 'ASC' | 'DESC';
  total: number;
  items: EventDto[];

  /**
   * Creates SearchResponseDto with pagination and sorting info
   *
   * @param data - Response data including page, pageSize, sortField, sortOrder, total, and items
   */
  constructor(data: {
    page: number;
    pageSize: number;
    sortField: string;
    sortOrder: 'ASC' | 'DESC';
    total: number;
    items: EventDto[];
  }) {
    this.page = data.page;
    this.pageSize = data.pageSize;
    this.sortField = data.sortField;
    this.sortOrder = data.sortOrder;
    this.total = data.total;
    this.items = data.items;
  }
}
