import { Test, TestingModule } from '@nestjs/testing';
import { EventService } from './events.service';
import { EventBufferService } from './event-buffer.service';
import { IEventRepository } from '../repositories/event.repository.interface';
import { EVENT_REPOSITORY_TOKEN } from '../repositories/event.repository.token';
import { CreateEventDto } from '../dtos/create-event.dto';
import { QueryDto } from '../dtos/query-events.dto';
import { BufferSaturatedException } from '../exceptions';

describe('EventService', () => {
  let service: EventService;
  let eventBufferService: EventBufferService;
  let eventRepository: IEventRepository;

  const mockEventRepository = {
    batchInsert: jest.fn(),
    findByServiceAndTimeRangeWithCount: jest.fn(),
    deleteOldEvents: jest.fn(),
  };

  const mockEventBufferService = {
    enqueue: jest.fn(),
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
          provide: EventBufferService,
          useValue: mockEventBufferService,
        },
      ],
    }).compile();

    service = module.get<EventService>(EventService);
    eventBufferService = module.get<EventBufferService>(EventBufferService);
    eventRepository = module.get<IEventRepository>(EVENT_REPOSITORY_TOKEN);

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

      await expect(service.ingest(createEventDto)).rejects.toThrow(BufferSaturatedException);
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
      const events: CreateEventDto[] = [
        {
          timestamp: new Date().toISOString(),
          service: 'test-service',
          message: 'Test message',
        },
      ];

      mockEventRepository.batchInsert.mockResolvedValue({ successful: 1, failed: 0 });

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
      expect(mockEventRepository.deleteOldEvents).toHaveBeenCalledWith(retentionDays);
    });
  });
});

