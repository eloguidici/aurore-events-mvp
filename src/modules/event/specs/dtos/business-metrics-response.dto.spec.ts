import { BusinessMetricsDto } from '../../dtos/business-metrics-response.dto';
import { BusinessMetrics } from '../../services/business-metrics.service';

describe('BusinessMetricsDto', () => {
  it('should create DTO from BusinessMetrics', () => {
    const metrics: BusinessMetrics = {
      totalEvents: 1000,
      eventsByService: {
        'test-service': 500,
        'other-service': 300,
      },
      eventsLast24Hours: 100,
      eventsLastHour: 10,
      averageEventsPerMinute: 0.07,
      topServices: [
        { service: 'test-service', count: 500 },
        { service: 'other-service', count: 300 },
      ],
      eventsByHour: [
        { hour: '2024-01-01 10:00', count: 10 },
        { hour: '2024-01-01 11:00', count: 20 },
      ],
    };

    const dto = new BusinessMetricsDto(metrics);

    expect(dto.totalEvents).toBe(1000);
    expect(dto.eventsByService).toEqual({
      'test-service': 500,
      'other-service': 300,
    });
    expect(dto.eventsLast24Hours).toBe(100);
    expect(dto.eventsLastHour).toBe(10);
    expect(dto.averageEventsPerMinute).toBe(0.07);
    expect(dto.topServices).toHaveLength(2);
    expect(dto.eventsByHour).toHaveLength(2);
  });

  it('should handle empty metrics', () => {
    const metrics: BusinessMetrics = {
      totalEvents: 0,
      eventsByService: {},
      eventsLast24Hours: 0,
      eventsLastHour: 0,
      averageEventsPerMinute: 0,
      topServices: [],
      eventsByHour: [],
    };

    const dto = new BusinessMetricsDto(metrics);

    expect(dto.totalEvents).toBe(0);
    expect(dto.eventsByService).toEqual({});
    expect(dto.topServices).toEqual([]);
    expect(dto.eventsByHour).toEqual([]);
  });
});
