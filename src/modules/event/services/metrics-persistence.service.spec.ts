import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsPersistenceService } from './metrics-persistence.service';
import { Event } from '../entities/event.entity';
import { EventBufferService } from './event-buffer.service';
import { CircuitBreakerService } from '../../common/services/circuit-breaker.service';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');

describe('MetricsPersistenceService', () => {
  let service: MetricsPersistenceService;
  let eventRepository: Repository<Event>;
  let eventBufferService: EventBufferService;

  const mockEventRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockEventBufferService = {
    getMetrics: jest.fn().mockReturnValue({
      buffer_size: 10,
      buffer_capacity: 100,
      buffer_utilization_percent: '10.00',
      metrics: {
        total_enqueued: 100,
        total_dropped: 0,
        drop_rate_percent: '0.00',
        throughput_events_per_second: '1.00',
      },
    }),
  };

  const mockCircuitBreakerService = {
    getMetrics: jest.fn().mockReturnValue({
      state: 'CLOSED',
      failureCount: 0,
      successCount: 100,
    }),
    execute: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsPersistenceService,
        {
          provide: getRepositoryToken(Event),
          useValue: mockEventRepository,
        },
        {
          provide: EventBufferService,
          useValue: mockEventBufferService,
        },
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
      ],
    }).compile();

    service = module.get<MetricsPersistenceService>(MetricsPersistenceService);
    eventRepository = module.get<Repository<Event>>(getRepositoryToken(Event));
    eventBufferService = module.get<EventBufferService>(EventBufferService);

    // Mock fs methods
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockRejectedValue({ code: 'ENOENT' }); // File doesn't exist by default

    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (service) {
      await service.onModuleDestroy();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMetricsHistory', () => {
    it('should return empty array when no history exists', async () => {
      // File doesn't exist - should return empty array
      (fs.readFile as jest.Mock).mockRejectedValue({ code: 'ENOENT' });

      const result = await service.getMetricsHistory();

      expect(result).toEqual([]);
    });

    it('should return metrics history', async () => {
      const mockSnapshot = {
        timestamp: new Date().toISOString(),
        buffer: {
          size: 10,
          capacity: 100,
          utilization_percent: '10.00',
          total_enqueued: 100,
          total_dropped: 0,
          drop_rate_percent: '0.00',
          throughput_events_per_second: '1.00',
        },
        circuitBreaker: {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 100,
        },
      };

      // JSONL format - one JSON object per line
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(mockSnapshot) + '\n',
      );

      const result = await service.getMetricsHistory();

      expect(result.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      const mockSnapshot = {
        timestamp: new Date().toISOString(),
        buffer: {
          size: 10,
          capacity: 100,
          utilization_percent: '10.00',
          total_enqueued: 100,
          total_dropped: 0,
          drop_rate_percent: '0.00',
          throughput_events_per_second: '1.00',
        },
        circuitBreaker: {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 100,
        },
      };

      // JSONL format - create 100 lines
      const lines = Array(100)
        .fill(null)
        .map(() => JSON.stringify(mockSnapshot));
      (fs.readFile as jest.Mock).mockResolvedValue(lines.join('\n'));

      const result = await service.getMetricsHistory(10);

      expect(result.length).toBeLessThanOrEqual(10);
    });
  });
});
