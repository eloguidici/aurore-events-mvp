import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';

import { ERROR_LOGGER_SERVICE_TOKEN } from '../../../common/services/interfaces/error-logger-service.token';
import { CONFIG_TOKENS } from '../../../config/tokens/config.tokens';
import { RetentionConfig } from '../../../config/interfaces/retention-config.interface';
import { EVENT_SERVICE_TOKEN } from '../../../event/services/interfaces/event-service.token';
import { RetentionService } from '../../services/retention.service';

describe('RetentionService', () => {
  let service: RetentionService;

  const mockEventService = {
    cleanup: jest.fn(),
  };

  const mockSchedulerRegistry = {
    addCronJob: jest.fn(),
  };

  const mockRetentionConfig: RetentionConfig = {
    days: 30,
    cronSchedule: '0 0 * * *',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionService,
        {
          provide: EVENT_SERVICE_TOKEN,
          useValue: mockEventService,
        },
        {
          provide: SchedulerRegistry,
          useValue: mockSchedulerRegistry,
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
          provide: CONFIG_TOKENS.RETENTION,
          useValue: mockRetentionConfig,
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

