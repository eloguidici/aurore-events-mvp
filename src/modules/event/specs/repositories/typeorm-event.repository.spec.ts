import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CIRCUIT_BREAKER_SERVICE_TOKEN } from '../../../common/services/interfaces/circuit-breaker-service.token';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../../../common/services/interfaces/error-logger-service.token';
import { CONFIG_TOKENS } from '../../../config/tokens/config.tokens';
import { ValidationConfig } from '../../../config/interfaces/validation-config.interface';
import { CreateEventDto } from '../../dtos/create-event.dto';
import { Event } from '../../entities/event.entity';
import { EnrichedEvent } from '../../services/interfaces/enriched-event.interface';
import { TypeOrmEventRepository } from '../../repositories/typeorm-event.repository';

describe('TypeOrmEventRepository', () => {
  let repository: TypeOrmEventRepository;

  const mockEventRepository = {
    manager: {
      transaction: jest.fn(),
    },
    createQueryBuilder: jest.fn(),
  };

  const mockCircuitBreaker = {
    execute: jest.fn(),
  };

  const mockValidationConfig: ValidationConfig = {
    messageMaxLength: 1000,
    metadataMaxSizeKB: 100,
    batchChunkSize: 500,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TypeOrmEventRepository,
        {
          provide: getRepositoryToken(Event),
          useValue: mockEventRepository,
        },
        {
          provide: CIRCUIT_BREAKER_SERVICE_TOKEN,
          useValue: mockCircuitBreaker,
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
          provide: CONFIG_TOKENS.VALIDATION,
          useValue: mockValidationConfig,
        },
      ],
    }).compile();

    repository = module.get<TypeOrmEventRepository>(TypeOrmEventRepository);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('batchInsert', () => {
    it('should return zero counts for empty array', async () => {
      const result = await repository.batchInsert([]);
      expect(result).toEqual({ successful: 0, failed: 0 });
    });

    it('should insert events successfully', async () => {
      const events: EnrichedEvent[] = [
        {
          eventId: 'evt_test123456',
          timestamp: new Date().toISOString(),
          service: 'test-service',
          message: 'Test message',
          ingestedAt: new Date().toISOString(),
        },
      ];

      const mockQueryBuilder = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockEventRepository.manager.transaction.mockImplementation(
        async (callback) => {
          const mockEntityManager = {
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          };
          return await callback(mockEntityManager);
        },
      );

      mockCircuitBreaker.execute.mockImplementation(async (operation) => {
        return await operation();
      });

      const result = await repository.batchInsert(events);

      expect(result.successful).toBeGreaterThan(0);
      expect(mockCircuitBreaker.execute).toHaveBeenCalled();
    });
  });

  describe('findByServiceAndTimeRangeWithCount', () => {
    it('should find events with count', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      };

      mockEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockCircuitBreaker.execute.mockImplementation(async (operation) => {
        return await operation();
      });

      const result = await repository.findByServiceAndTimeRangeWithCount({
        service: 'test-service',
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-31T23:59:59Z',
        limit: 10,
        offset: 0,
        sortField: 'timestamp',
        sortOrder: 'DESC',
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('events');
      expect(result).toHaveProperty('total');
      expect(mockCircuitBreaker.execute).toHaveBeenCalled();
    });
  });

  describe('deleteOldEvents', () => {
    it('should delete old events', async () => {
      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 100 }),
      };

      mockEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockCircuitBreaker.execute.mockImplementation(async (operation) => {
        return await operation();
      });

      const result = await repository.deleteOldEvents(30);

      expect(result).toBe(100);
      expect(mockCircuitBreaker.execute).toHaveBeenCalled();
    });
  });
});

