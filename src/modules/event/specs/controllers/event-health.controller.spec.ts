import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CIRCUIT_BREAKER_SERVICE_TOKEN } from '../../../common/services/interfaces/circuit-breaker-service.token';
import { HEALTH_SERVICE_TOKEN } from '../../../common/services/interfaces/health-service.token';
import { CONFIG_TOKENS } from '../../../config/tokens/config.tokens';
import { RateLimitingConfig } from '../../../config/interfaces/rate-limiting-config.interface';
import { Event } from '../../entities/event.entity';
import { BusinessMetricsService } from '../../services/business-metrics.service';
import { EVENT_BUFFER_SERVICE_TOKEN } from '../../services/interfaces/event-buffer-service.token';
import { EventHealthController } from '../../controllers/event-health.controller';

describe('EventHealthController', () => {
  let controller: EventHealthController;
  let eventRepository: Repository<Event>;
  let healthService: any;
  let circuitBreaker: any;
  let eventBufferService: any;
  let businessMetricsService: BusinessMetricsService;

  const mockEventRepository = {
    query: jest.fn(),
  };

  const mockHealthService = {
    checkHealth: jest.fn(),
  };

  const mockCircuitBreaker = {
    getState: jest.fn(),
    getMetrics: jest.fn(),
  };

  const mockEventBufferService = {
    getMetrics: jest.fn(),
  };

  const mockBusinessMetricsService = {
    getBusinessMetrics: jest.fn(),
  };

  const mockRateLimitingConfig: RateLimitingConfig = {
    ttlMs: 60000,
    globalLimit: 1000,
    ipLimit: 100,
    queryLimit: 50,
    healthLimit: 10,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventHealthController],
      providers: [
        {
          provide: HEALTH_SERVICE_TOKEN,
          useValue: mockHealthService,
        },
        {
          provide: CIRCUIT_BREAKER_SERVICE_TOKEN,
          useValue: mockCircuitBreaker,
        },
        {
          provide: EVENT_BUFFER_SERVICE_TOKEN,
          useValue: mockEventBufferService,
        },
        {
          provide: BusinessMetricsService,
          useValue: mockBusinessMetricsService,
        },
        {
          provide: getRepositoryToken(Event),
          useValue: mockEventRepository,
        },
        {
          provide: CONFIG_TOKENS.RATE_LIMITING,
          useValue: mockRateLimitingConfig,
        },
      ],
    }).compile();

    controller = module.get<EventHealthController>(EventHealthController);
    eventRepository = module.get<Repository<Event>>(getRepositoryToken(Event));
    healthService = module.get(HEALTH_SERVICE_TOKEN);
    circuitBreaker = module.get(CIRCUIT_BREAKER_SERVICE_TOKEN);
    eventBufferService = module.get(EVENT_BUFFER_SERVICE_TOKEN);
    businessMetricsService = module.get<BusinessMetricsService>(
      BusinessMetricsService,
    );

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkDatabase', () => {
    it('should return healthy status when database is connected', async () => {
      mockEventRepository.query.mockResolvedValue([{ '?column?': 1 }]);
      mockCircuitBreaker.getState.mockReturnValue('CLOSED');
      mockCircuitBreaker.getMetrics.mockReturnValue({
        failureCount: 0,
        successCount: 10,
      });

      const result = await controller.checkDatabase();

      expect(result).toEqual({
        status: 'healthy',
        database: 'connected',
        circuitBreaker: {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 10,
        },
      });
      expect(mockEventRepository.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return unhealthy status when database query fails', async () => {
      const error = new Error('Connection failed');
      mockEventRepository.query.mockRejectedValue(error);
      mockCircuitBreaker.getState.mockReturnValue('OPEN');
      mockCircuitBreaker.getMetrics.mockReturnValue({
        failureCount: 5,
        successCount: 0,
      });

      const result = await controller.checkDatabase();

      expect(result).toEqual({
        status: 'unhealthy',
        database: 'disconnected',
        error: 'Database connection failed',
        circuitBreaker: {
          state: 'OPEN',
          failureCount: 5,
          successCount: 0,
        },
      });
    });

    it('should sanitize error message when error message is not a string', async () => {
      const error = { code: 'ECONNREFUSED' };
      mockEventRepository.query.mockRejectedValue(error);
      mockCircuitBreaker.getState.mockReturnValue('CLOSED');
      mockCircuitBreaker.getMetrics.mockReturnValue({
        failureCount: 0,
        successCount: 0,
      });

      const result = await controller.checkDatabase();

      expect(result.error).toBe('Unknown database error');
    });
  });

  describe('checkBuffer', () => {
    it('should return buffer metrics', async () => {
      const mockMetrics = {
        status: 'healthy',
        buffer_size: 100,
        buffer_capacity: 1000,
        buffer_utilization_percent: 10,
        metrics: {
          total_enqueued: 500,
          total_dropped: 5,
          drop_rate_percent: 1,
          throughput_events_per_second: 10,
        },
      };

      mockEventBufferService.getMetrics.mockReturnValue(mockMetrics);

      const result = await controller.checkBuffer();

      expect(result).toEqual({
        status: 'healthy',
        buffer: {
          size: 100,
          capacity: 1000,
          utilization_percent: 10,
        },
        metrics: {
          total_enqueued: 500,
          total_dropped: 5,
          drop_rate_percent: 1,
          throughput_events_per_second: 10,
        },
      });
      expect(mockEventBufferService.getMetrics).toHaveBeenCalled();
    });
  });

  describe('getDetailedHealth', () => {
    it('should return detailed health status for all components', async () => {
      mockEventRepository.query.mockResolvedValue([{ '?column?': 1 }]);
      mockCircuitBreaker.getState.mockReturnValue('CLOSED');
      mockCircuitBreaker.getMetrics.mockReturnValue({
        failureCount: 0,
        successCount: 10,
      });
      mockHealthService.checkHealth.mockReturnValue({
        status: 200,
        message: 'Server is ready',
      });
      mockEventBufferService.getMetrics.mockReturnValue({
        status: 'healthy',
        buffer_size: 100,
        buffer_capacity: 1000,
        buffer_utilization_percent: 10,
        metrics: {
          total_enqueued: 500,
          total_dropped: 5,
          drop_rate_percent: 1,
          throughput_events_per_second: 10,
        },
      });
      mockBusinessMetricsService.getBusinessMetrics.mockResolvedValue({
        totalEvents: 1000,
        eventsByService: { 'test-service': 500 },
        eventsLast24Hours: 100,
        eventsLastHour: 10,
        averageEventsPerMinute: 0.07,
        topServices: [],
        eventsByHour: [],
      });

      const result = await controller.getDetailedHealth();

      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('server');
      expect(result).toHaveProperty('database');
      expect(result).toHaveProperty('buffer');
      expect(result).toHaveProperty('circuitBreaker');
      expect(result).toHaveProperty('business');
      expect(result.database.status).toBe('healthy');
      expect(result.buffer.status).toBe('healthy');
    });

    it('should handle errors gracefully when components fail', async () => {
      mockEventRepository.query.mockRejectedValue(new Error('DB Error'));
      mockHealthService.checkHealth.mockReturnValue({
        status: 200,
        message: 'Server is ready',
      });
      mockEventBufferService.getMetrics.mockReturnValue({
        status: 'healthy',
        buffer_size: 100,
        buffer_capacity: 1000,
        buffer_utilization_percent: 10,
        metrics: {
          total_enqueued: 500,
          total_dropped: 5,
          drop_rate_percent: 1,
          throughput_events_per_second: 10,
        },
      });
      mockBusinessMetricsService.getBusinessMetrics.mockRejectedValue(
        new Error('Metrics error'),
      );

      const result = await controller.getDetailedHealth();

      expect(result.database.status).toBe('unhealthy');
      expect(result.business).toHaveProperty('status');
      expect((result.business as any).status).toBe('error');
      expect((result.business as any).error).toBe('Business metrics unavailable');
    });
  });

  describe('getBusinessMetrics', () => {
    it('should return business metrics', async () => {
      const mockBusinessMetrics = {
        totalEvents: 1000,
        eventsByService: { 'test-service': 500 },
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

      mockBusinessMetricsService.getBusinessMetrics.mockResolvedValue(
        mockBusinessMetrics,
      );

      const result = await controller.getBusinessMetrics();

      expect(result).toBeDefined();
      expect(result.totalEvents).toBe(1000);
      expect(result.eventsByService).toEqual({ 'test-service': 500 });
      expect(mockBusinessMetricsService.getBusinessMetrics).toHaveBeenCalled();
    });
  });
});

