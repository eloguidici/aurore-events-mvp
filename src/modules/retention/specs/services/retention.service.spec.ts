import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';

import { EventService } from '../../../event/services/events.service';
import { RetentionService } from '../../services/retention.service';

describe('RetentionService', () => {
  let service: RetentionService;

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

