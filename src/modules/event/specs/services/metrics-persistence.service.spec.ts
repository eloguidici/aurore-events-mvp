import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CircuitBreakerService } from '../../../common/services/circuit-breaker.service';
import { Event } from '../../entities/event.entity';
import { MetricsSnapshot } from '../../repositories/interfaces/metrics.repository.interface';
import { METRICS_REPOSITORY_TOKEN } from '../../repositories/interfaces/metrics.repository.token';
import { EventBufferService } from '../../services/event-buffer.service';
import { MetricsPersistenceService } from '../../services/metrics-persistence.service';

describe('MetricsPersistenceService', () => {
  let service: MetricsPersistenceService;

  const mockEventRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockEventBufferService = {
    getMetrics: jest.fn().mockReturnValue({
      buffer_size: 10,
      buffer_capacity: 100,
      buffer_utilization_percent: '10.00',
      metrics: {
        total_enqueued: 100,
        total_dropped: 0,
        drop_rate_percent: '0.00',
        throughput_events_per_second: '1.00',
      },
    }),
  };

  const mockCircuitBreakerService = {
    getMetrics: jest.fn().mockReturnValue({
      state: 'CLOSED',
      failureCount: 0,
      successCount: 100,
    }),
    execute: jest.fn(),
  };

  const mockMetricsRepository = {
    save: jest.fn().mockResolvedValue(undefined),
    getHistory: jest.fn().mockResolvedValue([]),
    initialize: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsPersistenceService,
        {
          provide: getRepositoryToken(Event),
          useValue: mockEventRepository,
        },
        {
          provide: EventBufferService,
          useValue: mockEventBufferService,
        },
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
        {
          provide: METRICS_REPOSITORY_TOKEN,
          useValue: mockMetricsRepository,
        },
      ],
    }).compile();

    service = module.get<MetricsPersistenceService>(MetricsPersistenceService);

    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (service) {
      await service.onModuleDestroy();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMetricsHistory', () => {
    it('should return empty array when no history exists', async () => {
      // Repository returns empty array when no history exists
      mockMetricsRepository.getHistory.mockResolvedValue([]);

      const result = await service.getMetricsHistory();

      expect(result).toEqual([]);
      expect(mockMetricsRepository.getHistory).toHaveBeenCalled();
    });

    it('should return metrics history', async () => {
      const mockSnapshot: MetricsSnapshot = {
        timestamp: new Date().toISOString(),
        buffer: {
          size: 10,
          capacity: 100,
          utilization_percent: '10.00',
          total_enqueued: 100,
          total_dropped: 0,
          drop_rate_percent: '0.00',
          throughput_events_per_second: '1.00',
        },
        circuitBreaker: {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 100,
        },
      };

      mockMetricsRepository.getHistory.mockResolvedValue([mockSnapshot]);

      const result = await service.getMetricsHistory();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toEqual(mockSnapshot);
      expect(mockMetricsRepository.getHistory).toHaveBeenCalled();
    });

    it('should respect limit parameter', async () => {
      const mockSnapshot: MetricsSnapshot = {
        timestamp: new Date().toISOString(),
        buffer: {
          size: 10,
          capacity: 100,
          utilization_percent: '10.00',
          total_enqueued: 100,
          total_dropped: 0,
          drop_rate_percent: '0.00',
          throughput_events_per_second: '1.00',
        },
        circuitBreaker: {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 100,
        },
      };

      // Repository returns limited results
      const limitedSnapshots = Array(10).fill(mockSnapshot);
      mockMetricsRepository.getHistory.mockResolvedValue(limitedSnapshots);

      const result = await service.getMetricsHistory(10);

      expect(result.length).toBeLessThanOrEqual(10);
      expect(mockMetricsRepository.getHistory).toHaveBeenCalledWith(10);
    });
  });
});

