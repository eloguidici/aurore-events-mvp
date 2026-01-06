import { Test, TestingModule } from '@nestjs/testing';
import { EventBufferService } from './event-buffer.service';
import { EnrichedEvent } from '../interfaces/enriched-event.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock envs before importing the service
jest.mock('../../config/envs', () => ({
  envs: {
    bufferMaxSize: 1000,
    checkpointIntervalMs: 60000,
  },
}));

// Mock fs module
jest.mock('fs/promises');
jest.mock('fs', () => ({
  createWriteStream: jest.fn(),
}));

describe('EventBufferService', () => {
  let service: EventBufferService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventBufferService],
    }).compile();

    service = module.get<EventBufferService>(EventBufferService);

    // Mock fs methods
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
    (fs.unlink as jest.Mock).mockResolvedValue(undefined);
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
    it('should return metrics', () => {
      const metrics = service.getMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('buffer_size');
      expect(metrics).toHaveProperty('buffer_capacity');
      expect(metrics).toHaveProperty('buffer_utilization_percent');
      expect(metrics).toHaveProperty('metrics');
      expect(metrics.metrics).toHaveProperty('total_enqueued');
      expect(metrics.metrics).toHaveProperty('total_dropped');
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

