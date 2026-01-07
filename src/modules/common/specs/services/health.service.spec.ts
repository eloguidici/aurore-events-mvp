import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MESSAGES } from '../../constants/constants';
import { HealthService } from '../../services/health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    // Clean up any signal listeners
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initial state', () => {
    it('should start with server not ready', () => {
      expect(service.isServerReady()).toBe(false);
    });

    it('should start with server not shutting down', () => {
      expect(service.isServerShuttingDown()).toBe(false);
    });
  });

  describe('signalReady', () => {
    it('should mark server as ready', () => {
      service.signalReady();
      expect(service.isServerReady()).toBe(true);
    });
  });

  describe('signalNotReady', () => {
    it('should mark server as not ready', () => {
      service.signalReady();
      service.signalNotReady();
      expect(service.isServerReady()).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should mark server as shutting down and not ready', () => {
      service.signalReady();
      service.shutdown();

      expect(service.isServerShuttingDown()).toBe(true);
      expect(service.isServerReady()).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should mark server as shutting down', () => {
      service.onModuleDestroy();
      expect(service.isServerShuttingDown()).toBe(true);
    });
  });

  describe('registerShutdownHandler', () => {
    it('should register handler for SIGTERM', (done) => {
      const handler = jest.fn(() => {
        expect(handler).toHaveBeenCalled();
        expect(service.isServerShuttingDown()).toBe(true);
        done();
      });

      service.registerShutdownHandler(handler);
      process.emit('SIGTERM' as any);
    });

    it('should register handler for SIGINT', (done) => {
      const handler = jest.fn(() => {
        expect(handler).toHaveBeenCalled();
        expect(service.isServerShuttingDown()).toBe(true);
        done();
      });

      service.registerShutdownHandler(handler);
      process.emit('SIGINT' as any);
    });
  });

  describe('checkHealth', () => {
    it('should return OK when server is ready', () => {
      service.signalReady();
      const result = service.checkHealth();

      expect(result.status).toBe(HttpStatus.OK);
      expect(result.message).toBe(MESSAGES.SERVER_IS_READY);
    });

    it('should return SERVICE_UNAVAILABLE when server is shutting down', () => {
      service.shutdown();
      const result = service.checkHealth();

      expect(result.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(result.message).toBe(MESSAGES.SERVER_IS_SHUTTING_DOWN);
    });

    it('should return SERVICE_UNAVAILABLE when server is not ready', () => {
      // Server starts as not ready
      const result = service.checkHealth();

      expect(result.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(result.message).toBe(MESSAGES.SERVER_IS_NOT_READY);
    });

    it('should prioritize shutting down over not ready', () => {
      service.signalReady();
      service.shutdown();
      const result = service.checkHealth();

      expect(result.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(result.message).toBe(MESSAGES.SERVER_IS_SHUTTING_DOWN);
    });
  });

  describe('checkLiveness', () => {
    it('should return OK when server is not shutting down', () => {
      const result = service.checkLiveness();

      expect(result.status).toBe(HttpStatus.OK);
      expect(result.message).toBe(MESSAGES.SERVER_IS_NOT_SHUTTING_DOWN);
    });

    it('should return SERVICE_UNAVAILABLE when server is shutting down', () => {
      service.shutdown();
      const result = service.checkLiveness();

      expect(result.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(result.message).toBe(MESSAGES.SERVER_IS_SHUTTING_DOWN);
    });

    it('should return OK even if server is not ready but not shutting down', () => {
      // Server is not ready but not shutting down
      const result = service.checkLiveness();

      expect(result.status).toBe(HttpStatus.OK);
      expect(result.message).toBe(MESSAGES.SERVER_IS_NOT_SHUTTING_DOWN);
    });
  });

  describe('checkReadiness', () => {
    it('should return OK when server is ready', () => {
      service.signalReady();
      const result = service.checkReadiness();

      expect(result.status).toBe(HttpStatus.OK);
      expect(result.message).toBe(MESSAGES.SERVER_IS_READY);
    });

    it('should return SERVICE_UNAVAILABLE when server is not ready', () => {
      // Server starts as not ready
      const result = service.checkReadiness();

      expect(result.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(result.message).toBe(MESSAGES.SERVER_IS_NOT_READY);
    });

    it('should return SERVICE_UNAVAILABLE when server is shutting down', () => {
      service.shutdown();
      const result = service.checkReadiness();

      expect(result.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(result.message).toBe(MESSAGES.SERVER_IS_NOT_READY);
    });
  });

  describe('state management', () => {
    it('should handle state transitions correctly', () => {
      // Initial state
      expect(service.isServerReady()).toBe(false);
      expect(service.isServerShuttingDown()).toBe(false);

      // Signal ready
      service.signalReady();
      expect(service.isServerReady()).toBe(true);
      expect(service.isServerShuttingDown()).toBe(false);

      // Signal not ready (but not shutting down)
      service.signalNotReady();
      expect(service.isServerReady()).toBe(false);
      expect(service.isServerShuttingDown()).toBe(false);

      // Shutdown
      service.shutdown();
      expect(service.isServerReady()).toBe(false);
      expect(service.isServerShuttingDown()).toBe(true);
    });
  });
});

