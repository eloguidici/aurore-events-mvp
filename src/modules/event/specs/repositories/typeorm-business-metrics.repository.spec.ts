import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ERROR_LOGGER_SERVICE_TOKEN } from '../../../common/services/interfaces/error-logger-service.token';
import { Event } from '../../entities/event.entity';
import {
  HourlyCountRow,
  ServiceCountRow,
} from '../../repositories/interfaces/business-metrics.repository.interface';
import { TypeOrmBusinessMetricsRepository } from '../../repositories/typeorm-business-metrics.repository';

describe('TypeOrmBusinessMetricsRepository', () => {
  let repository: TypeOrmBusinessMetricsRepository;

  const mockEventRepository = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockErrorLogger = {
    logError: jest.fn(),
    logWarning: jest.fn(),
    createContext: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TypeOrmBusinessMetricsRepository,
        {
          provide: getRepositoryToken(Event),
          useValue: mockEventRepository,
        },
        {
          provide: ERROR_LOGGER_SERVICE_TOKEN,
          useValue: mockErrorLogger,
        },
      ],
    }).compile();

    repository = module.get<TypeOrmBusinessMetricsRepository>(
      TypeOrmBusinessMetricsRepository,
    );

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getTotalEventsCount', () => {
    it('should return total events count', async () => {
      const expectedCount = 12345;
      mockEventRepository.count.mockResolvedValue(expectedCount);

      const result = await repository.getTotalEventsCount();

      expect(result).toBe(expectedCount);
      expect(mockEventRepository.count).toHaveBeenCalled();
    });

    it('should handle errors and log them', async () => {
      const error = new Error('Database connection failed');
      mockEventRepository.count.mockRejectedValue(error);

      await expect(repository.getTotalEventsCount()).rejects.toThrow(error);

      expect(mockErrorLogger.logError).toHaveBeenCalledWith(
        expect.any(Object),
        'Failed to get total events count',
        error,
      );
    });
  });

  describe('getEventsByService', () => {
    it('should return events grouped by service', async () => {
      const mockServiceCountRows: ServiceCountRow[] = [
        { service: 'user-service', count: '5000' },
        { service: 'auth-service', count: '3000' },
        { service: 'payment-service', count: '2000' },
      ];

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockServiceCountRows),
      };

      mockEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await repository.getEventsByService();

      expect(result).toEqual(mockServiceCountRows);
      expect(mockEventRepository.createQueryBuilder).toHaveBeenCalledWith(
        'event',
      );
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        'event.service',
        'service',
      );
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith(
        'COUNT(*)',
        'count',
      );
      expect(mockQueryBuilder.groupBy).toHaveBeenCalledWith('event.service');
      expect(mockQueryBuilder.getRawMany).toHaveBeenCalled();
    });

    it('should return empty array when no events exist', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await repository.getEventsByService();

      expect(result).toEqual([]);
    });

    it('should handle errors and log them', async () => {
      const error = new Error('Query execution failed');
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockRejectedValue(error),
      };

      mockEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await expect(repository.getEventsByService()).rejects.toThrow(error);

      expect(mockErrorLogger.logError).toHaveBeenCalledWith(
        expect.any(Object),
        'Failed to get events by service',
        error,
      );
    });
  });

  describe('getEventsByTimeRange', () => {
    it('should return event counts for last 24 hours and last hour', async () => {
      const last24Hours = new Date('2024-01-15T00:00:00Z');
      const lastHour = new Date('2024-01-15T23:00:00Z');

      const mockQueryBuilder24h = {
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(5000),
      };

      const mockQueryBuilder1h = {
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(250),
      };

      mockEventRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder24h)
        .mockReturnValueOnce(mockQueryBuilder1h);

      const result = await repository.getEventsByTimeRange(
        last24Hours,
        lastHour,
      );

      expect(result).toEqual({
        eventsLast24Hours: 5000,
        eventsLastHour: 250,
      });

      expect(mockEventRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
      expect(mockQueryBuilder24h.where).toHaveBeenCalledWith(
        'event."createdAt" >= :last24Hours',
        { last24Hours },
      );
      expect(mockQueryBuilder1h.where).toHaveBeenCalledWith(
        'event."createdAt" >= :lastHour',
        { lastHour },
      );
    });

    it('should return zero counts when no events exist in time range', async () => {
      const last24Hours = new Date('2024-01-15T00:00:00Z');
      const lastHour = new Date('2024-01-15T23:00:00Z');

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      };

      mockEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await repository.getEventsByTimeRange(
        last24Hours,
        lastHour,
      );

      expect(result).toEqual({
        eventsLast24Hours: 0,
        eventsLastHour: 0,
      });
    });

    it('should handle errors and log them', async () => {
      const last24Hours = new Date('2024-01-15T00:00:00Z');
      const lastHour = new Date('2024-01-15T23:00:00Z');

      const error = new Error('Query execution failed');
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockRejectedValue(error),
      };

      mockEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await expect(
        repository.getEventsByTimeRange(last24Hours, lastHour),
      ).rejects.toThrow(error);

      expect(mockErrorLogger.logError).toHaveBeenCalledWith(
        expect.any(Object),
        'Failed to get events by time range',
        error,
      );
    });
  });

  describe('getEventsByHour', () => {
    it('should return events grouped by hour', async () => {
      const last24Hours = new Date('2024-01-15T00:00:00Z');

      const mockHourlyCountRows: HourlyCountRow[] = [
        { hour: '2024-01-15 10:00', count: '150' },
        { hour: '2024-01-15 11:00', count: '200' },
        { hour: '2024-01-15 12:00', count: '180' },
      ];

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockHourlyCountRows),
      };

      mockEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await repository.getEventsByHour(last24Hours);

      expect(result).toEqual(mockHourlyCountRows);
      expect(mockEventRepository.createQueryBuilder).toHaveBeenCalledWith(
        'event',
      );
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        'TO_CHAR(event."createdAt", \'YYYY-MM-DD HH24:00\')',
        'hour',
      );
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith(
        'COUNT(*)',
        'count',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'event."createdAt" >= :last24Hours',
        { last24Hours },
      );
      expect(mockQueryBuilder.groupBy).toHaveBeenCalledWith('hour');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('hour', 'ASC');
      expect(mockQueryBuilder.getRawMany).toHaveBeenCalled();
    });

    it('should return empty array when no events exist in time range', async () => {
      const last24Hours = new Date('2024-01-15T00:00:00Z');

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await repository.getEventsByHour(last24Hours);

      expect(result).toEqual([]);
    });

    it('should handle errors and log them', async () => {
      const last24Hours = new Date('2024-01-15T00:00:00Z');

      const error = new Error('Query execution failed');
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockRejectedValue(error),
      };

      mockEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await expect(repository.getEventsByHour(last24Hours)).rejects.toThrow(
        error,
      );

      expect(mockErrorLogger.logError).toHaveBeenCalledWith(
        expect.any(Object),
        'Failed to get events by hour',
        error,
      );
    });
  });
});
