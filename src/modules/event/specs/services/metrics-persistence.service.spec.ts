import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CIRCUIT_BREAKER_SERVICE_TOKEN } from '../../../common/services/interfaces/circuit-breaker-service.token';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../../../common/services/interfaces/error-logger-service.token';
import { CONFIG_TOKENS } from '../../../config/tokens/config.tokens';
import { MetricsConfig } from '../../../config/interfaces/metrics-config.interface';
import { Event } from '../../entities/event.entity';
import { MetricsSnapshot } from '../../repositories/interfaces/metrics.repository.interface';
import { METRICS_REPOSITORY_TOKEN } from '../../repositories/interfaces/metrics.repository.token';
import { EVENT_BUFFER_SERVICE_TOKEN } from '../../services/interfaces/event-buffer-service.token';
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

  const mockMetricsConfig: MetricsConfig = {
    historyDefaultLimit: 100,
    cacheTtlMs: 60000,
    persistenceIntervalMs: 60000,
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
          provide: EVENT_BUFFER_SERVICE_TOKEN,
          useValue: mockEventBufferService,
        },
        {
          provide: CIRCUIT_BREAKER_SERVICE_TOKEN,
          useValue: mockCircuitBreakerService,
        },
        {
          provide: ERROR_LOGGER_SERVICE_TOKEN,
          useValue: {
            logError: jest.fn(),
            logWarning: jest.fn(),
            createContext: jest.fn(),
          },
        },
        {
          provide: METRICS_REPOSITORY_TOKEN,
          useValue: mockMetricsRepository,
        },
        {
          provide: CONFIG_TOKENS.METRICS,
          useValue: mockMetricsConfig,
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

