import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for buffer metrics response
 * Contains buffer status, size, capacity, utilization statistics, and advanced metrics
 */
export class MetricsDto {
  @ApiProperty({
    description: 'System health status based on buffer utilization and drop rate',
    example: 'healthy',
    enum: ['healthy', 'warning', 'critical'],
  })
  status: 'healthy' | 'warning' | 'critical';

  @ApiProperty({
    description: 'Current number of events in buffer',
    example: 45,
    minimum: 0,
  })
  buffer_size: number;

  @ApiProperty({
    description: 'Maximum buffer capacity',
    example: 1000,
    minimum: 1,
  })
  buffer_capacity: number;

  @ApiProperty({
    description: 'Buffer utilization percentage (formatted to 2 decimal places)',
    example: '4.50',
    pattern: '^\\d+\\.\\d{2}$',
  })
  buffer_utilization_percent: string;

  @ApiProperty({
    description: 'Buffer metrics statistics',
    type: 'object',
    example: {
      total_enqueued: 1234,
      total_dropped: 0,
      drop_rate_percent: '0.00',
      throughput_events_per_second: '12.34',
    },
  })
  metrics: {
    total_enqueued: number;
    total_dropped: number;
    drop_rate_percent: string;
    throughput_events_per_second: string;
  };

  @ApiProperty({
    description: 'System uptime in seconds since service started',
    example: 3600.5,
    minimum: 0,
  })
  uptime_seconds: number;

  @ApiPropertyOptional({
    description: 'Time in seconds since last event was enqueued (null if no events enqueued yet)',
    example: 2.5,
    nullable: true,
  })
  time_since_last_enqueue_seconds: number | null;

  @ApiPropertyOptional({
    description: 'Time in seconds since last batch was drained (null if no batches drained yet)',
    example: 5.2,
    nullable: true,
  })
  time_since_last_drain_seconds: number | null;

  /**
   * Creates MetricsDto from buffer metrics
   * 
   * @param metrics - Buffer metrics from EventBufferService
   */
  constructor(metrics: {
    currentSize: number;
    capacity: number;
    utilizationPercent: number;
    totalEnqueued: number;
    totalDropped: number;
    dropRate: number;
    throughput: number;
    healthStatus: 'healthy' | 'warning' | 'critical';
    uptimeSeconds: number;
    timeSinceLastEnqueue: number | null;
    timeSinceLastDrain: number | null;
  }) {
    this.status = metrics.healthStatus;
    this.buffer_size = metrics.currentSize;
    this.buffer_capacity = metrics.capacity;
    this.buffer_utilization_percent = metrics.utilizationPercent.toFixed(2);
    this.metrics = {
      total_enqueued: metrics.totalEnqueued,
      total_dropped: metrics.totalDropped,
      drop_rate_percent: metrics.dropRate.toFixed(2),
      throughput_events_per_second: metrics.throughput.toFixed(2),
    };
    this.uptime_seconds = metrics.uptimeSeconds;
    this.time_since_last_enqueue_seconds = metrics.timeSinceLastEnqueue;
    this.time_since_last_drain_seconds = metrics.timeSinceLastDrain;
  }
}
