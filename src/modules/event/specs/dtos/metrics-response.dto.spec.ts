import { MetricsDto } from '../../dtos/metrics-response.dto';

describe('MetricsDto', () => {
  it('should create DTO with correct structure', () => {
    const metrics = {
      currentSize: 100,
      capacity: 1000,
      utilizationPercent: 10.0,
      totalEnqueued: 500,
      totalDropped: 5,
      dropRate: 1.0,
      throughput: 10.5,
      healthStatus: 'healthy' as const,
      uptimeSeconds: 3600.5,
      timeSinceLastEnqueue: 2.5,
      timeSinceLastDrain: 5.2,
    };

    const dto = new MetricsDto(metrics);

    expect(dto.status).toBe('healthy');
    expect(dto.buffer_size).toBe(100);
    expect(dto.buffer_capacity).toBe(1000);
    expect(dto.buffer_utilization_percent).toBe('10.00');
    expect(dto.metrics.total_enqueued).toBe(500);
    expect(dto.metrics.total_dropped).toBe(5);
    expect(dto.metrics.drop_rate_percent).toBe('1.00');
    expect(dto.metrics.throughput_events_per_second).toBe('10.50');
    expect(dto.uptime_seconds).toBe(3600.5);
    expect(dto.time_since_last_enqueue_seconds).toBe(2.5);
    expect(dto.time_since_last_drain_seconds).toBe(5.2);
  });

  it('should format percentages to 2 decimal places', () => {
    const metrics = {
      currentSize: 50,
      capacity: 1000,
      utilizationPercent: 5.123,
      totalEnqueued: 100,
      totalDropped: 1,
      dropRate: 1.234,
      throughput: 10.567,
      healthStatus: 'warning' as const,
      uptimeSeconds: 1800,
      timeSinceLastEnqueue: null,
      timeSinceLastDrain: null,
    };

    const dto = new MetricsDto(metrics);

    expect(dto.buffer_utilization_percent).toBe('5.12');
    expect(dto.metrics.drop_rate_percent).toBe('1.23');
    expect(dto.metrics.throughput_events_per_second).toBe('10.57');
  });

  it('should handle null values for optional time fields', () => {
    const metrics = {
      currentSize: 0,
      capacity: 1000,
      utilizationPercent: 0,
      totalEnqueued: 0,
      totalDropped: 0,
      dropRate: 0,
      throughput: 0,
      healthStatus: 'healthy' as const,
      uptimeSeconds: 0,
      timeSinceLastEnqueue: null,
      timeSinceLastDrain: null,
    };

    const dto = new MetricsDto(metrics);

    expect(dto.time_since_last_enqueue_seconds).toBeNull();
    expect(dto.time_since_last_drain_seconds).toBeNull();
  });

  it('should handle critical status', () => {
    const metrics = {
      currentSize: 950,
      capacity: 1000,
      utilizationPercent: 95.0,
      totalEnqueued: 1000,
      totalDropped: 50,
      dropRate: 5.0,
      throughput: 20.0,
      healthStatus: 'critical' as const,
      uptimeSeconds: 7200,
      timeSinceLastEnqueue: 0.1,
      timeSinceLastDrain: 1.0,
    };

    const dto = new MetricsDto(metrics);

    expect(dto.status).toBe('critical');
  });
});

