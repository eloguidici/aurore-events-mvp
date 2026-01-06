import { Test, TestingModule } from '@nestjs/testing';
import { BatchWorkerService } from './batch-worker.service';
import { EventBufferService } from '../../event/services/event-buffer.service';
import { EventService } from '../../event/services/events.service';
import { EnrichedEvent } from '../../event/interfaces/enriched-event.interface';

// Mock envs before importing the service
jest.mock('../../config/envs', () => ({
  envs: {
    batchSize: 100,
    drainInterval: 1000,
    maxRetries: 3,
    shutdownTimeoutMs: 5000,
  },
}));

describe('BatchWorkerService', () => {
  let service: BatchWorkerService;
  let eventBufferService: EventBufferService;
  let eventService: EventService;

  const mockEventBufferService = {
    drain: jest.fn(),
    getSize: jest.fn(),
    enqueue: jest.fn(),
  };

  const mockEventService = {
    insert: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchWorkerService,
        {
          provide: EventBufferService,
          useValue: mockEventBufferService,
        },
        {
          provide: EventService,
          useValue: mockEventService,
        },
      ],
    }).compile();

    service = module.get<BatchWorkerService>(BatchWorkerService);
    eventBufferService = module.get<EventBufferService>(EventBufferService);
    eventService = module.get<EventService>(EventService);

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
    mockEventBufferService.drain.mockReturnValueOnce(mockEvents).mockReturnValueOnce([]);
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

    // Configure mocks - ensure they return the expected values
    mockEventBufferService.drain.mockReturnValue(mockEvents);
    mockEventService.insert.mockResolvedValue({ successful: 0, failed: 1 });
    mockEventBufferService.enqueue.mockReturnValue(true);

    // Don't start the service to avoid interval interference
    // Just test the process method directly
    await (service as any).process();
    
    // Verify drain was called
    expect(mockEventBufferService.drain).toHaveBeenCalled();
    expect(mockEventBufferService.drain).toHaveBeenCalledWith(100);
    
    // Verify insert was called with the events
    expect(mockEventService.insert).toHaveBeenCalled();
    expect(mockEventService.insert).toHaveBeenCalledWith([
      {
        timestamp: mockEvents[0].timestamp,
        service: mockEvents[0].service,
        message: mockEvents[0].message,
        metadata: mockEvents[0].metadata,
      },
    ]);
    
    // Verify enqueue was called during retry
    expect(mockEventBufferService.enqueue).toHaveBeenCalled();
  });
});

