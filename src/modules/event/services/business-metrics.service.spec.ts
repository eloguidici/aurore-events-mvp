import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessMetricsService } from './business-metrics.service';
import { Event } from '../entities/event.entity';

describe('BusinessMetricsService', () => {
  let service: BusinessMetricsService;
  let repository: Repository<Event>;

  const mockRepository = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessMetricsService,
        {
          provide: getRepositoryToken(Event),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<BusinessMetricsService>(BusinessMetricsService);
    repository = module.get<Repository<Event>>(getRepositoryToken(Event));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty metrics when no events exist', async () => {
    mockRepository.count.mockResolvedValue(0);
    mockRepository.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
    });

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

