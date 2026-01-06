import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for event ingestion response
 * Returned when an event is successfully accepted and queued
 */
export class IngestEventResponseDto {
  @ApiProperty({
    description: 'Status of the ingestion operation',
    example: 'accepted',
    enum: ['accepted'],
  })
  status: 'accepted';

  @ApiProperty({
    description: 'Unique identifier for the ingested event',
    example: 'evt_12345678',
  })
  event_id: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp when the event was queued',
    example: '2024-01-15T10:30:00.000Z',
  })
  queued_at: string;

  /**
   * Creates IngestEventResponseDto from service result
   * 
   * @param data - Service result containing eventId and queuedAt
   */
  constructor(data: { eventId: string; queuedAt: string }) {
    this.status = 'accepted';
    this.event_id = data.eventId;
    this.queued_at = data.queuedAt;
  }
}

