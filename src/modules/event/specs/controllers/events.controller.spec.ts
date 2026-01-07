import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ERROR_LOGGER_SERVICE_TOKEN } from '../../../common/services/interfaces/error-logger-service.token';
import { CONFIG_TOKENS } from '../../../config/tokens/config.tokens';
import { RateLimitingConfig } from '../../../config/interfaces/rate-limiting-config.interface';
import { CreateEventDto } from '../../dtos/create-event.dto';
import { QueryDto } from '../../dtos/query-events.dto';
import { BufferSaturatedException } from '../../exceptions';
import { EVENT_BUFFER_SERVICE_TOKEN } from '../../services/interfaces/event-buffer-service.token';
import { EVENT_SERVICE_TOKEN } from '../../services/interfaces/event-service.token';
import { EventController } from '../../controllers/events.controller';

describe('EventController', () => {
  let controller: EventController;
  let eventService: any;
  let eventBufferService: any;

  const mockEventService = {
    ingest: jest.fn(),
    search: jest.fn(),
  };

  const mockEventBufferService = {
    getMetrics: jest.fn(),
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
      controllers: [EventController],
      providers: [
        {
          provide: EVENT_SERVICE_TOKEN,
          useValue: mockEventService,
        },
        {
          provide: EVENT_BUFFER_SERVICE_TOKEN,
          useValue: mockEventBufferService,
        },
        {
          provide: ERROR_LOGGER_SERVICE_TOKEN,
          useValue: {
            logError: jest.fn(),
            logWarning: jest.fn(),
            createContext: jest.fn((eventId?, service?, additional?) => ({
              ...(eventId && { eventId }),
              ...(service && { service }),
              ...additional,
            })),
          },
        },
        {
          provide: CONFIG_TOKENS.RATE_LIMITING,
          useValue: mockRateLimitingConfig,
        },
      ],
    }).compile();

    controller = module.get<EventController>(EventController);
    eventService = module.get(EVENT_SERVICE_TOKEN);
    eventBufferService = module.get(EVENT_BUFFER_SERVICE_TOKEN);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('ingestEvent', () => {
    it('should successfully ingest event', async () => {
      const createEventDto: CreateEventDto = {
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
      };

      const mockResponse = {
        status: 'queued',
        event_id: 'evt_test123456',
        queued_at: new Date().toISOString(),
      };

      mockEventService.ingest.mockResolvedValue(mockResponse);

      const req = {
        correlationId: 'test-correlation-id',
      } as any;

      const result = await controller.ingestEvent(createEventDto, req);

      expect(result).toEqual(mockResponse);
      expect(mockEventService.ingest).toHaveBeenCalledWith(createEventDto);
    });

    it('should re-throw HttpException when buffer is saturated', async () => {
      const createEventDto: CreateEventDto = {
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
      };

      const bufferSaturatedError = new BufferSaturatedException(5);
      mockEventService.ingest.mockRejectedValue(bufferSaturatedError);

      const req = {
        correlationId: 'test-correlation-id',
      } as any;

      await expect(
        controller.ingestEvent(createEventDto, req),
      ).rejects.toThrow(BufferSaturatedException);
    });

    it('should convert unexpected errors to HttpException', async () => {
      const createEventDto: CreateEventDto = {
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
      };

      const unexpectedError = new Error('Unexpected error');
      mockEventService.ingest.mockRejectedValue(unexpectedError);

      const req = {
        correlationId: 'test-correlation-id',
      } as any;

      await expect(
        controller.ingestEvent(createEventDto, req),
      ).rejects.toThrow(HttpException);

      try {
        await controller.ingestEvent(createEventDto, req);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
        const response = (error as HttpException).getResponse() as any;
        expect(response.errorCode).toBe('INGESTION_ERROR');
      }
    });
  });

  describe('queryEvents', () => {
    it('should successfully query events', async () => {
      const queryDto: QueryDto = {
        service: 'test-service',
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-31T23:59:59Z',
        page: 1,
        pageSize: 10,
      };

      const mockResponse = {
        page: 1,
        pageSize: 10,
        total: 0,
        items: [],
      };

      mockEventService.search.mockResolvedValue(mockResponse);

      const req = {
        correlationId: 'test-correlation-id',
      } as any;

      const result = await controller.queryEvents(queryDto, req);

      expect(result).toEqual(mockResponse);
      expect(mockEventService.search).toHaveBeenCalledWith(queryDto);
    });

    it('should handle timestamp validation errors', async () => {
      const queryDto: QueryDto = {
        service: 'test-service',
        from: 'invalid-timestamp',
        to: '2024-01-31T23:59:59Z',
        page: 1,
        pageSize: 10,
      };

      const timestampError = new Error('Invalid timestamp format');
      mockEventService.search.mockRejectedValue(timestampError);

      const req = {
        correlationId: 'test-correlation-id',
      } as any;

      await expect(controller.queryEvents(queryDto, req)).rejects.toThrow(
        HttpException,
      );

      try {
        await controller.queryEvents(queryDto, req);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.BAD_REQUEST,
        );
      }
    });

    it('should handle time range validation errors', async () => {
      const queryDto: QueryDto = {
        service: 'test-service',
        from: '2024-01-31T23:59:59Z',
        to: '2024-01-01T00:00:00Z',
        page: 1,
        pageSize: 10,
      };

      const timeRangeError = new Error('Time range is invalid');
      mockEventService.search.mockRejectedValue(timeRangeError);

      const req = {
        correlationId: 'test-correlation-id',
      } as any;

      await expect(controller.queryEvents(queryDto, req)).rejects.toThrow(
        HttpException,
      );

      try {
        await controller.queryEvents(queryDto, req);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.BAD_REQUEST,
        );
      }
    });

    it('should convert unexpected errors to HttpException', async () => {
      const queryDto: QueryDto = {
        service: 'test-service',
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-31T23:59:59Z',
        page: 1,
        pageSize: 10,
      };

      const unexpectedError = new Error('Database connection failed');
      mockEventService.search.mockRejectedValue(unexpectedError);

      const req = {
        correlationId: 'test-correlation-id',
      } as any;

      await expect(controller.queryEvents(queryDto, req)).rejects.toThrow(
        HttpException,
      );

      try {
        await controller.queryEvents(queryDto, req);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    });
  });

  describe('getMetrics', () => {
    it('should return buffer metrics', () => {
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

      const result = controller.getMetrics();

      expect(result).toEqual(mockMetrics);
      expect(mockEventBufferService.getMetrics).toHaveBeenCalled();
    });

    it('should re-throw HttpException when metrics retrieval fails', () => {
      const httpError = new HttpException(
        'Metrics unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      mockEventBufferService.getMetrics.mockImplementation(() => {
        throw httpError;
      });

      expect(() => controller.getMetrics()).toThrow(HttpException);
    });

    it('should convert unexpected errors to HttpException', () => {
      const unexpectedError = new Error('Unexpected error');
      mockEventBufferService.getMetrics.mockImplementation(() => {
        throw unexpectedError;
      });

      expect(() => controller.getMetrics()).toThrow(HttpException);

      try {
        controller.getMetrics();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
        const response = (error as HttpException).getResponse() as any;
        expect(response.errorCode).toBe('METRICS_ERROR');
      }
    });
  });
});

