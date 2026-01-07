import { Test, TestingModule } from '@nestjs/testing';

import { CONFIG_TOKENS } from '../../../config/tokens/config.tokens';
import { ServiceConfig } from '../../../config/interfaces/service-config.interface';
import { QueryConfig } from '../../../config/interfaces/query-config.interface';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../../../common/services/interfaces/error-logger-service.token';
import { SANITIZER_SERVICE_TOKEN } from '../../../common/services/interfaces/sanitizer-service.token';
import { CreateEventDto } from '../../dtos/create-event.dto';
import { QueryDto } from '../../dtos/query-events.dto';
import { BufferSaturatedException } from '../../exceptions';
import { EnrichedEvent } from '../../services/interfaces/enriched-event.interface';
import { EVENT_REPOSITORY_TOKEN } from '../../repositories/interfaces/event.repository.token';
import { EVENT_BUFFER_SERVICE_TOKEN } from '../../services/interfaces/event-buffer-service.token';
import { EventService } from '../../services/events.service';

describe('EventService', () => {
  let service: EventService;

  const mockEventRepository = {
    batchInsert: jest.fn(),
    findByServiceAndTimeRangeWithCount: jest.fn(),
    deleteOldEvents: jest.fn(),
  };

  const mockEventBufferService = {
    enqueue: jest.fn(),
  };

  const mockServiceConfig: ServiceConfig = {
    nameMaxLength: 255,
    retryAfterSeconds: 60,
  };

  const mockQueryConfig: QueryConfig = {
    defaultLimit: 10,
    maxLimit: 1000,
    maxTimeRangeDays: 30,
    queryTimeoutMs: 30000,
    maxPage: 10000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        {
          provide: EVENT_REPOSITORY_TOKEN,
          useValue: mockEventRepository,
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
          provide: SANITIZER_SERVICE_TOKEN,
          useValue: {
            sanitizeString: jest.fn((str) => {
              // Simulate actual sanitization - remove HTML tags
              if (!str || typeof str !== 'string') return str;
              return str.replace(/<[^>]*>/g, '');
            }),
            sanitizeObject: jest.fn((obj) => {
              // Simulate actual sanitization for objects
              if (!obj || typeof obj !== 'object') return obj;
              if (Array.isArray(obj)) {
                return obj.map(item => 
                  typeof item === 'string' ? item.replace(/<[^>]*>/g, '') : item
                );
              }
              const sanitized: any = {};
              for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'string') {
                  sanitized[key] = value.replace(/<[^>]*>/g, '');
                } else if (typeof value === 'object' && value !== null) {
                  sanitized[key] = value; // Simplified for test
                } else {
                  sanitized[key] = value;
                }
              }
              return sanitized;
            }),
          },
        },
        {
          provide: CONFIG_TOKENS.SERVICE,
          useValue: mockServiceConfig,
        },
        {
          provide: CONFIG_TOKENS.QUERY,
          useValue: mockQueryConfig,
        },
      ],
    }).compile();

    service = module.get<EventService>(EventService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ingest', () => {
    it('should successfully ingest event when buffer has capacity', async () => {
      const createEventDto: CreateEventDto = {
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
      };

      mockEventBufferService.enqueue.mockReturnValue(true);

      const result = await service.ingest(createEventDto);

      expect(result).toBeDefined();
      expect(result.event_id).toMatch(/^evt_[a-f0-9]{12}$/);
      expect(result.queued_at).toBeDefined();
      expect(mockEventBufferService.enqueue).toHaveBeenCalled();
    });

    it('should throw BufferSaturatedException when buffer is full', async () => {
      const createEventDto: CreateEventDto = {
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
      };

      mockEventBufferService.enqueue.mockReturnValue(false);

      await expect(service.ingest(createEventDto)).rejects.toThrow(
        BufferSaturatedException,
      );
    });

    it('should sanitize input before enqueueing', async () => {
      const createEventDto: CreateEventDto = {
        timestamp: new Date().toISOString(),
        service: '<script>alert("xss")</script>test-service',
        message: '<b>Bold</b> message',
        metadata: { html: '<script>alert("xss")</script>' },
      };

      mockEventBufferService.enqueue.mockReturnValue(true);

      await service.ingest(createEventDto);

      const enqueueCall = mockEventBufferService.enqueue.mock.calls[0][0];
      expect(enqueueCall.service).not.toContain('<script>');
      expect(enqueueCall.message).not.toContain('<b>');
      expect(enqueueCall.metadata.html).not.toContain('<script>');
    });
  });

  describe('insert', () => {
    it('should insert events and return result', async () => {
      const events: EnrichedEvent[] = [
        {
          eventId: 'evt_test123456',
          timestamp: new Date().toISOString(),
          service: 'test-service',
          message: 'Test message',
          ingestedAt: new Date().toISOString(),
        },
      ];

      mockEventRepository.batchInsert.mockResolvedValue({
        successful: 1,
        failed: 0,
      });

      const result = await service.insert(events);

      expect(result).toEqual({ successful: 1, failed: 0 });
      expect(mockEventRepository.batchInsert).toHaveBeenCalledWith(events);
    });
  });

  describe('search', () => {
    it('should search events with pagination', async () => {
      const queryDto: QueryDto = {
        service: 'test-service',
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-31T23:59:59Z',
        page: 1,
        pageSize: 10,
      };

      mockEventRepository.findByServiceAndTimeRangeWithCount.mockResolvedValue({
        events: [],
        total: 0,
      });

      const result = await service.search(queryDto);

      expect(result).toBeDefined();
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  describe('cleanup', () => {
    it('should delete old events', async () => {
      const retentionDays = 30;
      mockEventRepository.deleteOldEvents.mockResolvedValue(100);

      const result = await service.cleanup(retentionDays);

      expect(result).toBe(100);
      expect(mockEventRepository.deleteOldEvents).toHaveBeenCalledWith(
        retentionDays,
      );
    });
  });
});

