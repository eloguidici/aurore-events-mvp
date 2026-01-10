import { Test, TestingModule } from '@nestjs/testing';

import { ERROR_LOGGER_SERVICE_TOKEN } from '../../../common/services/interfaces/error-logger-service.token';
import { METRICS_COLLECTOR_SERVICE_TOKEN } from '../../../common/services/interfaces/metrics-collector-service.token';
import { BatchWorkerConfig } from '../../../config/interfaces/batch-worker-config.interface';
import { ShutdownConfig } from '../../../config/interfaces/shutdown-config.interface';
import { CONFIG_TOKENS } from '../../../config/tokens/config.tokens';
import { EnrichedEvent } from '../../../event/services/interfaces/enriched-event.interface';
import { EVENT_BUFFER_SERVICE_TOKEN } from '../../../event/services/interfaces/event-buffer-service.token';
import { EVENT_SERVICE_TOKEN } from '../../../event/services/interfaces/event-service.token';
import { BatchWorkerService } from '../../services/batch-worker.service';

describe('BatchWorkerService', () => {
  let service: BatchWorkerService;

  const mockEventBufferService = {
    drain: jest.fn(),
    getSize: jest.fn(),
    enqueue: jest.fn(),
  };

  const mockEventService = {
    insert: jest.fn(),
  };

  const mockMetricsCollector = {
    recordBatchProcessed: jest.fn(),
    getBatchWorkerMetrics: jest.fn(),
  };

  const mockBatchWorkerConfig: BatchWorkerConfig = {
    batchSize: 100,
    drainInterval: 1000,
    maxRetries: 3,
    maxBatchSize: 10000,
  };

  const mockShutdownConfig: ShutdownConfig = {
    timeoutMs: 5000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchWorkerService,
        {
          provide: EVENT_BUFFER_SERVICE_TOKEN,
          useValue: mockEventBufferService,
        },
        {
          provide: EVENT_SERVICE_TOKEN,
          useValue: mockEventService,
        },
        {
          provide: METRICS_COLLECTOR_SERVICE_TOKEN,
          useValue: mockMetricsCollector,
        },
        {
          provide: ERROR_LOGGER_SERVICE_TOKEN,
          useValue: {
            logError: jest.fn(),
            logWarning: jest.fn(),
            createContext: jest.fn((eventId?, service?, additional?) => ({
              ...(eventId && { eventId }),
              ...(service && { service }),
              ...additional,
            })),
          },
        },
        {
          provide: CONFIG_TOKENS.BATCH_WORKER,
          useValue: mockBatchWorkerConfig,
        },
        {
          provide: CONFIG_TOKENS.SHUTDOWN,
          useValue: mockShutdownConfig,
        },
      ],
    }).compile();

    service = module.get<BatchWorkerService>(BatchWorkerService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should start worker', () => {
    service.start();
    expect(service['isRunning']).toBe(true);
  });

  it('should not start if already running', () => {
    service.start();
    const initialIntervalId = service['intervalId'];
    service.start();
    expect(service['intervalId']).toBe(initialIntervalId);
  });

  it('should process empty batch when buffer is empty', async () => {
    mockEventBufferService.drain.mockReturnValue([]);

    service.start();

    // Manually trigger process to test immediately (interval might be long)
    await (service as any).process();

    expect(mockEventBufferService.drain).toHaveBeenCalled();
    expect(mockEventService.insert).not.toHaveBeenCalled();

    await service.stop();
  });

  it('should process batch when buffer has events', async () => {
    const mockEvents: EnrichedEvent[] = [
      {
        eventId: 'evt_123',
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
        ingestedAt: new Date().toISOString(),
      },
    ];

    mockEventBufferService.drain.mockReturnValue(mockEvents);
    mockEventService.insert.mockResolvedValue({ successful: 1, failed: 0 });

    service.start();

    // Manually trigger process to test immediately (interval might be long)
    await (service as any).process();

    expect(mockEventBufferService.drain).toHaveBeenCalled();
    expect(mockEventService.insert).toHaveBeenCalled();
    expect(mockMetricsCollector.recordBatchProcessed).toHaveBeenCalled();

    await service.stop();
  });

  it('should stop worker and process remaining events', async () => {
    const mockEvents: EnrichedEvent[] = [
      {
        eventId: 'evt_123',
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
        ingestedAt: new Date().toISOString(),
      },
    ];

    // Mock getSize to return 1 first, then 0 after drain
    let sizeCallCount = 0;
    mockEventBufferService.getSize.mockImplementation(() => {
      sizeCallCount++;
      return sizeCallCount === 1 ? 1 : 0; // First call returns 1, subsequent calls return 0
    });
    mockEventBufferService.drain
      .mockReturnValueOnce(mockEvents)
      .mockReturnValueOnce([]);
    mockEventService.insert.mockResolvedValue({ successful: 1, failed: 0 });

    service.start();
    await service.stop();

    expect(mockEventBufferService.drain).toHaveBeenCalled();
    expect(mockEventService.insert).toHaveBeenCalled();
  }, 10000); // Increase timeout to 10 seconds

  it('should handle insert failures gracefully', async () => {
    const mockEvents: EnrichedEvent[] = [
      {
        eventId: 'evt_123',
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
        ingestedAt: new Date().toISOString(),
      },
    ];

    // Reset mocks explicitly for this test
    mockEventBufferService.drain.mockReset();
    mockEventService.insert.mockReset();
    mockEventBufferService.enqueue.mockReset();

    // Configure mocks using mockImplementation to ensure they work correctly
    mockEventBufferService.drain.mockImplementation(() => mockEvents);
    mockEventService.insert.mockImplementation(() =>
      Promise.resolve({ successful: 0, failed: 1 }),
    );
    mockEventBufferService.enqueue.mockReturnValue(true);

    // Verify the service is using the mocked dependencies
    expect(service['eventBufferService']).toBe(mockEventBufferService);
    expect(service['eventService']).toBe(mockEventService);

    // Test the process method directly - same as the working test
    await (service as any).process();

    // Verify drain was called and returned events
    expect(mockEventBufferService.drain).toHaveBeenCalled();
    expect(mockEventBufferService.drain).toHaveBeenCalledWith(100);

    // Verify insert was called with the events (EnrichedEvent[])
    expect(mockEventService.insert).toHaveBeenCalled();
    expect(mockEventService.insert).toHaveBeenCalledWith(mockEvents);

    // Verify enqueue was called during retry
    expect(mockEventBufferService.enqueue).toHaveBeenCalled();
  });
});
