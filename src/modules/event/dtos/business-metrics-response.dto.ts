import { ApiProperty } from '@nestjs/swagger';
import { BusinessMetrics } from '../services/business-metrics.service';

/**
 * DTO for business metrics response
 * Contains insights into event patterns, service usage, and trends
 */
export class BusinessMetricsDto implements BusinessMetrics {
  @ApiProperty({
    description: 'Total number of events in the system',
    example: 123456,
    minimum: 0,
  })
  totalEvents: number;

  @ApiProperty({
    description: 'Number of events grouped by service name',
    example: {
      'user-service': 50000,
      'auth-service': 30000,
      'payment-service': 20000,
    },
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  eventsByService: Record<string, number>;

  @ApiProperty({
    description: 'Number of events ingested in the last 24 hours',
    example: 5000,
    minimum: 0,
  })
  eventsLast24Hours: number;

  @ApiProperty({
    description: 'Number of events ingested in the last hour',
    example: 250,
    minimum: 0,
  })
  eventsLastHour: number;

  @ApiProperty({
    description: 'Average number of events per minute (calculated from last 24 hours)',
    example: 3.47,
    minimum: 0,
  })
  averageEventsPerMinute: number;

  @ApiProperty({
    description: 'Top 10 services by event count',
    example: [
      { service: 'user-service', count: 50000 },
      { service: 'auth-service', count: 30000 },
    ],
    type: [Object],
  })
  topServices: Array<{ service: string; count: number }>;

  @ApiProperty({
    description: 'Number of events grouped by hour (last 24 hours)',
    example: [
      { hour: '2024-01-15 10:00', count: 150 },
      { hour: '2024-01-15 11:00', count: 200 },
    ],
    type: [Object],
  })
  eventsByHour: Array<{ hour: string; count: number }>;

  /**
   * Creates BusinessMetricsDto from BusinessMetrics
   *
   * @param metrics - BusinessMetrics object to convert
   */
  constructor(metrics: BusinessMetrics) {
    this.totalEvents = metrics.totalEvents;
    this.eventsByService = metrics.eventsByService;
    this.eventsLast24Hours = metrics.eventsLast24Hours;
    this.eventsLastHour = metrics.eventsLastHour;
    this.averageEventsPerMinute = metrics.averageEventsPerMinute;
    this.topServices = metrics.topServices;
    this.eventsByHour = metrics.eventsByHour;
  }
}

