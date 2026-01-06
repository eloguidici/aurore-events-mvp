import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';
import * as path from 'path';

import { FileMetricsRepository } from '../../repositories/file-metrics.repository';
import { MetricsSnapshot } from '../../repositories/interfaces/metrics.repository.interface';

// Mock fs/promises
jest.mock('fs/promises');

describe('FileMetricsRepository', () => {
  let repository: FileMetricsRepository;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileMetricsRepository],
    }).compile();

    repository = module.get<FileMetricsRepository>(FileMetricsRepository);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('initialize', () => {
    it('should create metrics directory if it does not exist', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      await repository.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('metrics'),
        { recursive: true },
      );
    });

    it('should throw error when directory creation fails', async () => {
      const error = new Error('Permission denied');
      mockFs.mkdir.mockRejectedValue(error);

      await expect(repository.initialize()).rejects.toThrow('Permission denied');
    });
  });

  describe('save', () => {
    beforeEach(async () => {
      // Initialize repository before each save test
      mockFs.mkdir.mockResolvedValue(undefined);
      await repository.initialize();
      jest.clearAllMocks();
    });

    it('should save metrics snapshot to file', async () => {
      const snapshot: MetricsSnapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        buffer: {
          size: 100,
          capacity: 1000,
          utilization_percent: '10.0',
          total_enqueued: 500,
          total_dropped: 5,
          drop_rate_percent: '1.0',
          throughput_events_per_second: '10.0',
        },
        circuitBreaker: {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 10,
        },
      };

      mockFs.appendFile.mockResolvedValue(undefined);

      await repository.save(snapshot);

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('metrics-history.jsonl'),
        expect.stringContaining('"timestamp":"2024-01-01T00:00:00Z"'),
        'utf-8',
      );
    });

    it('should append snapshot as JSON line', async () => {
      const snapshot: MetricsSnapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        buffer: {
          size: 100,
          capacity: 1000,
          utilization_percent: '10.0',
          total_enqueued: 500,
          total_dropped: 5,
          drop_rate_percent: '1.0',
          throughput_events_per_second: '10.0',
        },
        circuitBreaker: {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 10,
        },
      };

      mockFs.appendFile.mockResolvedValue(undefined);

      await repository.save(snapshot);

      const appendCall = mockFs.appendFile.mock.calls[0];
      const content = appendCall[1] as string;

      expect(content).toContain(JSON.stringify(snapshot));
      expect(content.endsWith('\n')).toBe(true);
    });

    it('should throw error when file write fails', async () => {
      const snapshot: MetricsSnapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        buffer: {
          size: 100,
          capacity: 1000,
          utilization_percent: '10.0',
          total_enqueued: 500,
          total_dropped: 5,
          drop_rate_percent: '1.0',
          throughput_events_per_second: '10.0',
        },
        circuitBreaker: {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 10,
        },
      };

      const error = new Error('Disk full');
      mockFs.appendFile.mockRejectedValue(error);

      await expect(repository.save(snapshot)).rejects.toThrow('Disk full');
    });
  });

  describe('getHistory', () => {
    beforeEach(async () => {
      // Initialize repository before each getHistory test
      mockFs.mkdir.mockResolvedValue(undefined);
      await repository.initialize();
      jest.clearAllMocks();
    });

    it('should return empty array when file does not exist', async () => {
      const error = new Error('File not found');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      const result = await repository.getHistory(10);

      expect(result).toEqual([]);
    });

    it('should return last N snapshots from file', async () => {
      const snapshots: MetricsSnapshot[] = [
        {
          timestamp: '2024-01-01T00:00:00Z',
          buffer: {
            size: 100,
            capacity: 1000,
            utilization_percent: '10.0',
            total_enqueued: 500,
            total_dropped: 5,
            drop_rate_percent: '1.0',
            throughput_events_per_second: '10.0',
          },
          circuitBreaker: {
            state: 'CLOSED',
            failureCount: 0,
            successCount: 10,
          },
        },
        {
          timestamp: '2024-01-01T01:00:00Z',
          buffer: {
            size: 200,
            capacity: 1000,
            utilization_percent: '20.0',
            total_enqueued: 600,
            total_dropped: 6,
            drop_rate_percent: '1.0',
            throughput_events_per_second: '12.0',
          },
          circuitBreaker: {
            state: 'CLOSED',
            failureCount: 0,
            successCount: 20,
          },
        },
        {
          timestamp: '2024-01-01T02:00:00Z',
          buffer: {
            size: 300,
            capacity: 1000,
            utilization_percent: '30.0',
            total_enqueued: 700,
            total_dropped: 7,
            drop_rate_percent: '1.0',
            throughput_events_per_second: '14.0',
          },
          circuitBreaker: {
            state: 'CLOSED',
            failureCount: 0,
            successCount: 30,
          },
        },
      ];

      const fileContent = snapshots
        .map((s) => JSON.stringify(s))
        .join('\n')
        .concat('\n');

      mockFs.readFile.mockResolvedValue(fileContent);

      const result = await repository.getHistory(2);

      expect(result).toHaveLength(2);
      expect(result[0].timestamp).toBe('2024-01-01T01:00:00Z');
      expect(result[1].timestamp).toBe('2024-01-01T02:00:00Z');
    });

    it('should return all snapshots when limit is greater than available', async () => {
      const snapshot: MetricsSnapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        buffer: {
          size: 100,
          capacity: 1000,
          utilization_percent: '10.0',
          total_enqueued: 500,
          total_dropped: 5,
          drop_rate_percent: '1.0',
          throughput_events_per_second: '10.0',
        },
        circuitBreaker: {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 10,
        },
      };

      const fileContent = JSON.stringify(snapshot) + '\n';
      mockFs.readFile.mockResolvedValue(fileContent);

      const result = await repository.getHistory(10);

      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe('2024-01-01T00:00:00Z');
    });

    it('should filter out empty lines', async () => {
      const snapshot: MetricsSnapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        buffer: {
          size: 100,
          capacity: 1000,
          utilization_percent: '10.0',
          total_enqueued: 500,
          total_dropped: 5,
          drop_rate_percent: '1.0',
          throughput_events_per_second: '10.0',
        },
        circuitBreaker: {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 10,
        },
      };

      const fileContent = JSON.stringify(snapshot) + '\n\n\n';
      mockFs.readFile.mockResolvedValue(fileContent);

      const result = await repository.getHistory(10);

      expect(result).toHaveLength(1);
    });

    it('should return empty array when file read fails with non-ENOENT error', async () => {
      const error = new Error('Permission denied');
      (error as NodeJS.ErrnoException).code = 'EACCES';
      mockFs.readFile.mockRejectedValue(error);

      const result = await repository.getHistory(10);

      expect(result).toEqual([]);
    });

    it('should handle malformed JSON gracefully by returning empty array', async () => {
      const fileContent = 'invalid json\n{"valid": "json"}\n';
      mockFs.readFile.mockResolvedValue(fileContent);

      // The repository catches JSON parse errors and returns empty array
      const result = await repository.getHistory(10);
      expect(result).toEqual([]);
    });
  });
});

