import { Event } from '../entities/event.entity';

/**
 * DTO for event response
 * Maps Event entity to response format with parsed metadata
 */
export class EventDto {
  id: string;
  timestamp: string;
  service: string;
  message: string;
  metadata: Record<string, any> | null;
  ingestedAt: string;
  createdAt: Date;

  /**
   * Creates EventDto from Event entity
   *
   * @param event - Event entity to convert
   */
  constructor(event: Event) {
    this.id = event.id;
    this.timestamp = event.timestamp;
    this.service = event.service;
    this.message = event.message;
    this.metadata = event.metadataJson ? JSON.parse(event.metadataJson) : null;
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
