import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';

import { ERROR_LOGGER_SERVICE_TOKEN } from '../../../common/services/interfaces/error-logger-service.token';
import { METRICS_COLLECTOR_SERVICE_TOKEN } from '../../../common/services/interfaces/metrics-collector-service.token';
import { BufferConfig } from '../../../config/interfaces/buffer-config.interface';
import { CheckpointConfig } from '../../../config/interfaces/checkpoint-config.interface';
import { CONFIG_TOKENS } from '../../../config/tokens/config.tokens';
import { EventBufferService } from '../../services/event-buffer.service';
import { EnrichedEvent } from '../../services/interfaces/enriched-event.interface';

// Mock fs module
jest.mock('fs/promises');
jest.mock('fs', () => {
  const mockWriteStream = {
    write: jest.fn().mockReturnValue(true),
    end: jest.fn(),
    on: jest.fn(),
    closed: false,
    destroy: jest.fn(),
  };

  return {
    createWriteStream: jest.fn(() => {
      // Setup the 'on' method to handle 'finish' event
      mockWriteStream.on.mockImplementation((event, callback) => {
        if (event === 'finish') {
          // Immediately call finish callback
          setImmediate(() => callback());
        }
        return mockWriteStream;
      });
      return mockWriteStream;
    }),
  };
});

describe('EventBufferService', () => {
  let service: EventBufferService;

  const mockMetricsCollector = {
    recordBufferEnqueue: jest.fn(),
    recordBufferDrop: jest.fn(),
    recordBufferDrain: jest.fn(),
    getBufferMetrics: jest.fn(),
  };

  const mockBufferConfig: BufferConfig = {
    maxSize: 1000,
  };

  const mockCheckpointConfig: CheckpointConfig = {
    intervalMs: 60000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventBufferService,
        {
          provide: METRICS_COLLECTOR_SERVICE_TOKEN,
          useValue: mockMetricsCollector,
        },
        {
          provide: CONFIG_TOKENS.BUFFER,
          useValue: mockBufferConfig,
        },
        {
          provide: CONFIG_TOKENS.CHECKPOINT,
          useValue: mockCheckpointConfig,
        },
        {
          provide: ERROR_LOGGER_SERVICE_TOKEN,
          useValue: {
            logError: jest.fn(),
            logWarning: jest.fn(),
            createContext: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EventBufferService>(EventBufferService);

    jest.clearAllMocks();

    // Mock fs methods
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
    (fs.unlink as jest.Mock).mockResolvedValue(undefined);
    (fs.rename as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (service) {
      await service.onModuleDestroy();
    }
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enqueue', () => {
    it('should enqueue event when buffer has capacity', () => {
      const event: EnrichedEvent = {
        eventId: 'evt_123',
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
        ingestedAt: new Date().toISOString(),
      };

      const result = service.enqueue(event);

      expect(result).toBe(true);
      expect(service.getSize()).toBe(1);
      expect(mockMetricsCollector.recordBufferEnqueue).toHaveBeenCalled();
    });

    it('should return false when buffer is full', () => {
      // Fill buffer to capacity
      const event: EnrichedEvent = {
        eventId: 'evt_123',
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
        ingestedAt: new Date().toISOString(),
      };

      // Mock maxSize to be small for testing using Object.defineProperty
      const originalMaxSize = service['maxSize'];
      Object.defineProperty(service, 'maxSize', {
        value: 1,
        writable: true,
        configurable: true,
      });

      service.enqueue(event);
      const result = service.enqueue(event); // Should fail - buffer full

      expect(result).toBe(false);
      expect(service.getSize()).toBe(1);
      expect(mockMetricsCollector.recordBufferDrop).toHaveBeenCalled();

      // Restore original maxSize
      Object.defineProperty(service, 'maxSize', {
        value: originalMaxSize,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('drain', () => {
    it('should return empty array when buffer is empty', () => {
      const result = service.drain(10);
      expect(result).toEqual([]);
    });

    it('should drain events from buffer', () => {
      const event: EnrichedEvent = {
        eventId: 'evt_123',
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
        ingestedAt: new Date().toISOString(),
      };

      service.enqueue(event);
      expect(service.getSize()).toBe(1);

      const drained = service.drain(10);
      expect(drained.length).toBe(1);
      expect(drained[0].eventId).toBe('evt_123');
      expect(service.getSize()).toBe(0);
      expect(mockMetricsCollector.recordBufferDrain).toHaveBeenCalled();
    });

    it('should drain only up to batchSize', () => {
      // Enqueue multiple events
      for (let i = 0; i < 5; i++) {
        service.enqueue({
          eventId: `evt_${i}`,
          timestamp: new Date().toISOString(),
          service: 'test-service',
          message: `Message ${i}`,
          ingestedAt: new Date().toISOString(),
        });
      }

      const drained = service.drain(3);
      expect(drained.length).toBe(3);
      expect(service.getSize()).toBe(2);
    });
  });

  describe('getSize', () => {
    it('should return 0 for empty buffer', () => {
      expect(service.getSize()).toBe(0);
    });

    it('should return correct size after enqueue', () => {
      const event: EnrichedEvent = {
        eventId: 'evt_123',
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
        ingestedAt: new Date().toISOString(),
      };

      service.enqueue(event);
      expect(service.getSize()).toBe(1);

      service.enqueue(event);
      expect(service.getSize()).toBe(2);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics from MetricsCollectorService', () => {
      mockMetricsCollector.getBufferMetrics.mockReturnValue({
        totalEnqueued: 100,
        totalDropped: 5,
        startTime: Date.now() - 3600000, // 1 hour ago
        lastEnqueueTime: Date.now() - 1000,
        lastDrainTime: Date.now() - 500,
      });

      const metrics = service.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('buffer_size');
      expect(metrics).toHaveProperty('buffer_capacity');
      expect(metrics).toHaveProperty('buffer_utilization_percent');
      expect(metrics).toHaveProperty('metrics');
      expect(metrics.metrics.total_enqueued).toBe(100);
      expect(metrics.metrics.total_dropped).toBe(5);
      expect(mockMetricsCollector.getBufferMetrics).toHaveBeenCalled();
    });
  });

  describe('isFull', () => {
    it('should return false when buffer has capacity', () => {
      expect(service.isFull()).toBe(false);
    });

    it('should return true when buffer is full', () => {
      const event: EnrichedEvent = {
        eventId: 'evt_123',
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
        ingestedAt: new Date().toISOString(),
      };

      // Mock maxSize to be small for testing using Object.defineProperty
      const originalMaxSize = service['maxSize'];
      Object.defineProperty(service, 'maxSize', {
        value: 1,
        writable: true,
        configurable: true,
      });

      service.enqueue(event);
      expect(service.isFull()).toBe(true);

      // Restore original maxSize
      Object.defineProperty(service, 'maxSize', {
        value: originalMaxSize,
        writable: true,
        configurable: true,
      });
    });
  });
});
