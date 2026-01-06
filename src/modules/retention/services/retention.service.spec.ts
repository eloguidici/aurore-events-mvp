import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { RetentionService } from './retention.service';
import { EventService } from '../../event/services/events.service';

describe('RetentionService', () => {
  let service: RetentionService;
  let eventService: EventService;
  let schedulerRegistry: SchedulerRegistry;

  const mockEventService = {
    cleanup: jest.fn(),
  };

  const mockSchedulerRegistry = {
    addCronJob: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionService,
        {
          provide: EventService,
          useValue: mockEventService,
        },
        {
          provide: SchedulerRegistry,
          useValue: mockSchedulerRegistry,
        },
      ],
    }).compile();

    service = module.get<RetentionService>(RetentionService);
    eventService = module.get<EventService>(EventService);
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should register cron job on module init', () => {
    service.onModuleInit();
    expect(mockSchedulerRegistry.addCronJob).toHaveBeenCalled();
  });

  describe('cleanup', () => {
    it('should delete old events', async () => {
      mockEventService.cleanup.mockResolvedValue(100);

      await service.cleanup();

      expect(mockEventService.cleanup).toHaveBeenCalled();
    });

    it('should log error if cleanup fails', async () => {
      const error = new Error('Cleanup failed');
      mockEventService.cleanup.mockRejectedValue(error);

      // Should not throw - error is logged but service continues
      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});
