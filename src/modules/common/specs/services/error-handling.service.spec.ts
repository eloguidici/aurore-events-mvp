import { Test, TestingModule } from '@nestjs/testing';

import { HealthService } from '../../services/health.service';
import { ErrorHandlingService } from '../../services/error-handling.service';

describe('ErrorHandlingService', () => {
  let service: ErrorHandlingService;
  let healthService: HealthService;

  const mockHealthService = {
    signalNotReady: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErrorHandlingService,
        {
          provide: HealthService,
          useValue: mockHealthService,
        },
      ],
    }).compile();

    service = module.get<ErrorHandlingService>(ErrorHandlingService);
    healthService = module.get<HealthService>(HealthService);

    // Clear all process listeners to avoid interference between tests
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('warning');

    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up listeners after each test
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('warning');
    
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should register error handlers on module init', () => {
      const setupErrorHandlersSpy = jest.spyOn(
        service as any,
        'setupErrorHandlers',
      );
      service.onModuleInit();

      expect(setupErrorHandlersSpy).toHaveBeenCalled();
    });

    it('should not register handlers multiple times', () => {
      const setupErrorHandlersSpy = jest.spyOn(
        service as any,
        'setupErrorHandlers',
      );

      service.onModuleInit();
      service.onModuleInit();

      // Should only be called once (checked internally)
      expect(setupErrorHandlersSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('uncaughtException handler', () => {
    it('should handle uncaught exceptions', (done) => {
      service.onModuleInit();

      // Mock process.exit to prevent actual exit
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          expect(code).toBe(1);
          expect(mockHealthService.signalNotReady).toHaveBeenCalled();
          exitSpy.mockRestore();
          done();
          return undefined as never;
        });

      const error = new Error('Test uncaught exception');
      process.emit('uncaughtException' as any, error);
    });

    it('should log error details on uncaught exception', (done) => {
      const loggerSpy = jest.spyOn(service['logger'], 'error');
      service.onModuleInit();

      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation(() => {
          expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('Uncaught Exception'),
            expect.any(String),
            'UncaughtException',
          );
          exitSpy.mockRestore();
          done();
          return undefined as never;
        });

      const error = new Error('Test error');
      process.emit('uncaughtException' as any, error);
    });
  });

  describe('unhandledRejection handler', () => {
    it('should handle unhandled promise rejections', (done) => {
      const loggerSpy = jest.spyOn(service['logger'], 'error');
      service.onModuleInit();

      const error = new Error('Test rejection');
      const promise = Promise.reject(error);
      
      // Suppress the actual unhandled rejection warning
      promise.catch(() => {});
      
      process.emit('unhandledRejection' as any, error, promise);

      // Wait for async handling - use setImmediate for better async handling
      setImmediate(() => {
        expect(loggerSpy).toHaveBeenCalled();
        done();
      });
    });

    it('should mark server as not ready for critical errors', (done) => {
      service.onModuleInit();

      const error = new Error('ECONNREFUSED: Connection refused');
      const promise = Promise.reject(error);
      
      // Suppress the actual unhandled rejection warning
      promise.catch(() => {});
      
      process.emit('unhandledRejection' as any, error, promise);

      setImmediate(() => {
        expect(mockHealthService.signalNotReady).toHaveBeenCalled();
        done();
      });
    });

    it('should not mark server as not ready for non-critical errors', (done) => {
      service.onModuleInit();

      const error = new Error('Validation failed: invalid input');
      const promise = Promise.reject(error);
      
      // Suppress the actual unhandled rejection warning
      promise.catch(() => {});
      
      process.emit('unhandledRejection' as any, error, promise);

      setImmediate(() => {
        expect(mockHealthService.signalNotReady).not.toHaveBeenCalled();
        done();
      });
    });

    it('should handle non-Error rejection reasons', (done) => {
      const loggerSpy = jest.spyOn(service['logger'], 'error');
      service.onModuleInit();

      const reason = 'String rejection';
      const promise = Promise.reject(reason);
      
      // Suppress the actual unhandled rejection warning
      promise.catch(() => {});
      
      process.emit('unhandledRejection' as any, reason, promise);

      setImmediate(() => {
        expect(loggerSpy).toHaveBeenCalled();
        done();
      });
    });
  });

  describe('warning handler', () => {
    it('should handle process warnings', () => {
      const loggerSpy = jest.spyOn(service['logger'], 'warn');
      service.onModuleInit();

      const warning = new Error('Test warning');
      warning.name = 'Warning';
      process.emit('warning' as any, warning);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Node.js Warning'),
        expect.any(String),
      );
    });
  });

  describe('isCriticalError', () => {
    it('should identify database connection errors as critical', () => {
      const isCriticalError = (service as any).isCriticalError.bind(service);

      expect(isCriticalError(new Error('ECONNREFUSED: Connection refused'))).toBe(
        true,
      );
      expect(isCriticalError(new Error('ETIMEDOUT: Connection timed out'))).toBe(
        true,
      );
      expect(isCriticalError(new Error('ENOTFOUND: Host not found'))).toBe(true);
    });

    it('should identify memory errors as critical', () => {
      const isCriticalError = (service as any).isCriticalError.bind(service);

      expect(isCriticalError(new Error('out of memory'))).toBe(true);
      expect(isCriticalError(new Error('Out of memory'))).toBe(true);
    });

    it('should identify TypeError as critical', () => {
      const isCriticalError = (service as any).isCriticalError.bind(service);

      expect(isCriticalError(new Error('cannot read property of undefined'))).toBe(
        true,
      );
      expect(isCriticalError(new TypeError('TypeError: invalid type'))).toBe(true);
    });

    it('should not identify validation errors as critical', () => {
      const isCriticalError = (service as any).isCriticalError.bind(service);

      expect(
        isCriticalError(new Error('Validation failed: invalid input')),
      ).toBe(false);
      expect(isCriticalError(new Error('Invalid user input'))).toBe(false);
    });

    it('should return false for non-Error values', () => {
      const isCriticalError = (service as any).isCriticalError.bind(service);

      expect(isCriticalError('string')).toBe(false);
      expect(isCriticalError(null)).toBe(false);
      expect(isCriticalError(undefined)).toBe(false);
      expect(isCriticalError({})).toBe(false);
    });
  });
});

