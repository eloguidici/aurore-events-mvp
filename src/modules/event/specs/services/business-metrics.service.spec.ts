import { Test, TestingModule } from '@nestjs/testing';

import { ERROR_LOGGER_SERVICE_TOKEN } from '../../../common/services/interfaces/error-logger-service.token';
import { MetricsConfig } from '../../../config/interfaces/metrics-config.interface';
import { CONFIG_TOKENS } from '../../../config/tokens/config.tokens';
import { BUSINESS_METRICS_REPOSITORY_TOKEN } from '../../repositories/interfaces/business-metrics.repository.token';
import { BusinessMetricsService } from '../../services/business-metrics.service';

describe('BusinessMetricsService', () => {
  let service: BusinessMetricsService;

  const mockBusinessMetricsRepository = {
    getTotalEventsCount: jest.fn(),
    getEventsByService: jest.fn(),
    getEventsByTimeRange: jest.fn(),
    getEventsByHour: jest.fn(),
  };

  const mockMetricsConfig: MetricsConfig = {
    historyDefaultLimit: 100,
    cacheTtlMs: 60000,
    persistenceIntervalMs: 60000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessMetricsService,
        {
          provide: BUSINESS_METRICS_REPOSITORY_TOKEN,
          useValue: mockBusinessMetricsRepository,
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
          provide: CONFIG_TOKENS.METRICS,
          useValue: mockMetricsConfig,
        },
      ],
    }).compile();

    service = module.get<BusinessMetricsService>(BusinessMetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty metrics when no events exist', async () => {
    mockBusinessMetricsRepository.getTotalEventsCount.mockResolvedValue(0);
    mockBusinessMetricsRepository.getEventsByService.mockResolvedValue([]);
    mockBusinessMetricsRepository.getEventsByTimeRange.mockResolvedValue({
      eventsLast24Hours: 0,
      eventsLastHour: 0,
    });
    mockBusinessMetricsRepository.getEventsByHour.mockResolvedValue([]);

    const metrics = await service.getBusinessMetrics();

    expect(metrics.totalEvents).toBe(0);
    expect(metrics.eventsByService).toEqual({});
    expect(metrics.topServices).toEqual([]);
  });

  it('should invalidate cache', () => {
    service.invalidateCache();
    // Cache should be cleared
    expect(service['metricsCache']).toBeNull();
    expect(service['cacheTimestamp']).toBe(0);
  });
});
