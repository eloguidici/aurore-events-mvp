import { Test, TestingModule } from '@nestjs/testing';

import { MetricsCollectorService } from '../../services/metrics-collector.service';

describe('MetricsCollectorService', () => {
  let service: MetricsCollectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsCollectorService],
    }).compile();

    service = module.get<MetricsCollectorService>(MetricsCollectorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordBufferEnqueue', () => {
    it('should increment totalEnqueued counter', () => {
      const initialMetrics = service.getBufferMetrics();
      service.recordBufferEnqueue();

      const metrics = service.getBufferMetrics();
      expect(metrics.totalEnqueued).toBe(initialMetrics.totalEnqueued + 1);
    });

    it('should update lastEnqueueTime', () => {
      const beforeTime = Date.now();
      service.recordBufferEnqueue();
      const afterTime = Date.now();

      const metrics = service.getBufferMetrics();
      expect(metrics.lastEnqueueTime).toBeGreaterThanOrEqual(beforeTime);
      expect(metrics.lastEnqueueTime).toBeLessThanOrEqual(afterTime);
    });

    it('should track multiple enqueue operations', () => {
      service.recordBufferEnqueue();
      service.recordBufferEnqueue();
      service.recordBufferEnqueue();

      const metrics = service.getBufferMetrics();
      expect(metrics.totalEnqueued).toBe(3);
    });
  });

  describe('recordBufferDrop', () => {
    it('should increment totalDropped counter', () => {
      const initialMetrics = service.getBufferMetrics();
      service.recordBufferDrop();

      const metrics = service.getBufferMetrics();
      expect(metrics.totalDropped).toBe(initialMetrics.totalDropped + 1);
    });

    it('should track multiple drop operations', () => {
      service.recordBufferDrop();
      service.recordBufferDrop();

      const metrics = service.getBufferMetrics();
      expect(metrics.totalDropped).toBe(2);
    });
  });

  describe('recordBufferDrain', () => {
    it('should update lastDrainTime', () => {
      const beforeTime = Date.now();
      service.recordBufferDrain();
      const afterTime = Date.now();

      const metrics = service.getBufferMetrics();
      expect(metrics.lastDrainTime).toBeGreaterThanOrEqual(beforeTime);
      expect(metrics.lastDrainTime).toBeLessThanOrEqual(afterTime);
    });

    it('should update drain time on multiple calls', () => {
      service.recordBufferDrain();
      const firstDrainTime = service.getBufferMetrics().lastDrainTime;

      // Wait a bit to ensure time difference
      const waitTime = 10;
      return new Promise((resolve) => {
        setTimeout(() => {
          service.recordBufferDrain();
          const secondDrainTime = service.getBufferMetrics().lastDrainTime;
          expect(secondDrainTime).toBeGreaterThan(firstDrainTime);
          resolve(undefined);
        }, waitTime);
      });
    });
  });

  describe('recordBatchProcessed', () => {
    it('should increment totalBatchesProcessed', () => {
      const initialMetrics = service.getBatchWorkerMetrics();
      service.recordBatchProcessed(10, 100, 50);

      const metrics = service.getBatchWorkerMetrics();
      expect(metrics.totalBatchesProcessed).toBe(
        initialMetrics.totalBatchesProcessed + 1,
      );
    });

    it('should increment totalEventsProcessed by batch size', () => {
      const initialMetrics = service.getBatchWorkerMetrics();
      service.recordBatchProcessed(10, 100, 50);
      service.recordBatchProcessed(5, 50, 25);

      const metrics = service.getBatchWorkerMetrics();
      expect(metrics.totalEventsProcessed).toBe(
        initialMetrics.totalEventsProcessed + 15,
      );
    });

    it('should accumulate totalInsertTimeMs', () => {
      service.recordBatchProcessed(10, 100, 50);
      service.recordBatchProcessed(5, 50, 25);

      const metrics = service.getBatchWorkerMetrics();
      expect(metrics.totalInsertTimeMs).toBe(75);
    });

    it('should calculate average batch processing time', () => {
      service.recordBatchProcessed(10, 100, 50);
      service.recordBatchProcessed(5, 200, 25);

      const metrics = service.getBatchWorkerMetrics();
      expect(metrics.averageBatchProcessingTimeMs).toBe(150); // (100 + 200) / 2
    });

    it('should handle first batch correctly', () => {
      service.recordBatchProcessed(10, 100, 50);

      const metrics = service.getBatchWorkerMetrics();
      expect(metrics.averageBatchProcessingTimeMs).toBe(100);
    });

    it('should log performance metrics every 100 batches', () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log');

      // Record 100 batches
      for (let i = 0; i < 100; i++) {
        service.recordBatchProcessed(10, 100, 50);
      }

      expect(loggerSpy).toHaveBeenCalled();
      const logCall = loggerSpy.mock.calls[loggerSpy.mock.calls.length - 1][0];
      expect(logCall).toContain('Performance metrics');
      expect(logCall).toContain('avg batch time');
      expect(logCall).toContain('avg insert');
    });

    it('should not log performance metrics before 100 batches', () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log');

      // Record 99 batches
      for (let i = 0; i < 99; i++) {
        service.recordBatchProcessed(10, 100, 50);
      }

      // Should not log performance metrics yet
      const performanceLogs = loggerSpy.mock.calls.filter((call) =>
        call[0].toString().includes('Performance metrics'),
      );
      expect(performanceLogs.length).toBe(0);
    });
  });

  describe('getBufferMetrics', () => {
    it('should return a snapshot of buffer metrics', () => {
      service.recordBufferEnqueue();
      service.recordBufferDrop();
      service.recordBufferDrain();

      const metrics = service.getBufferMetrics();

      expect(metrics).toHaveProperty('totalEnqueued');
      expect(metrics).toHaveProperty('totalDropped');
      expect(metrics).toHaveProperty('startTime');
      expect(metrics).toHaveProperty('lastEnqueueTime');
      expect(metrics).toHaveProperty('lastDrainTime');
    });

    it('should return a copy, not the original object', () => {
      const metrics1 = service.getBufferMetrics();
      service.recordBufferEnqueue();
      const metrics2 = service.getBufferMetrics();

      expect(metrics1).not.toBe(metrics2);
      expect(metrics1.totalEnqueued).not.toBe(metrics2.totalEnqueued);
    });
  });

  describe('getBatchWorkerMetrics', () => {
    it('should return a snapshot of batch worker metrics', () => {
      service.recordBatchProcessed(10, 100, 50);

      const metrics = service.getBatchWorkerMetrics();

      expect(metrics).toHaveProperty('totalBatchesProcessed');
      expect(metrics).toHaveProperty('totalEventsProcessed');
      expect(metrics).toHaveProperty('totalInsertTimeMs');
      expect(metrics).toHaveProperty('averageBatchProcessingTimeMs');
    });

    it('should return a copy, not the original object', () => {
      const metrics1 = service.getBatchWorkerMetrics();
      service.recordBatchProcessed(10, 100, 50);
      const metrics2 = service.getBatchWorkerMetrics();

      expect(metrics1).not.toBe(metrics2);
      expect(metrics1.totalBatchesProcessed).not.toBe(
        metrics2.totalBatchesProcessed,
      );
    });
  });

  describe('reset', () => {
    it('should reset all buffer metrics', () => {
      service.recordBufferEnqueue();
      service.recordBufferDrop();
      service.recordBufferDrain();

      service.reset();

      const metrics = service.getBufferMetrics();
      expect(metrics.totalEnqueued).toBe(0);
      expect(metrics.totalDropped).toBe(0);
      expect(metrics.lastEnqueueTime).toBe(0);
      expect(metrics.lastDrainTime).toBe(0);
    });

    it('should reset all batch worker metrics', () => {
      service.recordBatchProcessed(10, 100, 50);
      service.recordBatchProcessed(5, 200, 25);

      service.reset();

      const metrics = service.getBatchWorkerMetrics();
      expect(metrics.totalBatchesProcessed).toBe(0);
      expect(metrics.totalEventsProcessed).toBe(0);
      expect(metrics.totalInsertTimeMs).toBe(0);
      expect(metrics.averageBatchProcessingTimeMs).toBe(0);
    });

    it('should update startTime on reset', () => {
      const initialStartTime = service.getBufferMetrics().startTime;

      // Wait a bit
      return new Promise((resolve) => {
        setTimeout(() => {
          service.reset();
          const newStartTime = service.getBufferMetrics().startTime;
          expect(newStartTime).toBeGreaterThan(initialStartTime);
          resolve(undefined);
        }, 10);
      });
    });
  });

  describe('integration', () => {
    it('should track complete workflow', () => {
      // Simulate a workflow
      service.recordBufferEnqueue();
      service.recordBufferEnqueue();
      service.recordBufferDrain();
      service.recordBatchProcessed(2, 150, 75);
      service.recordBufferEnqueue();
      service.recordBufferDrop(); // Buffer full

      const bufferMetrics = service.getBufferMetrics();
      const batchMetrics = service.getBatchWorkerMetrics();

      expect(bufferMetrics.totalEnqueued).toBe(3);
      expect(bufferMetrics.totalDropped).toBe(1);
      expect(batchMetrics.totalBatchesProcessed).toBe(1);
      expect(batchMetrics.totalEventsProcessed).toBe(2);
    });
  });
});

