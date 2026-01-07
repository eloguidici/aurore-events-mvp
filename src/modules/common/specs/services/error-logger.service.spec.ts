import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorLoggerService } from '../../services/error-logger.service';

describe('ErrorLoggerService', () => {
  let service: ErrorLoggerService;
  let logger: Logger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ErrorLoggerService],
    }).compile();

    service = module.get<ErrorLoggerService>(ErrorLoggerService);
    logger = new Logger('TestLogger');
    jest.clearAllMocks();
  });

  describe('logError', () => {
    it('should log error with Error object', () => {
      const errorSpy = jest.spyOn(logger, 'error');
      const error = new Error('Test error message');
      error.stack = 'Error stack trace';

      service.logError(logger, 'Something went wrong', error);

      expect(errorSpy).toHaveBeenCalledWith(
        'Something went wrong',
        'Error stack trace',
        expect.objectContaining({
          errorMessage: 'Test error message',
          errorStack: 'Error stack trace',
        }),
      );
    });

    it('should log error with string error', () => {
      const errorSpy = jest.spyOn(logger, 'error');

      service.logError(logger, 'Something went wrong', 'String error');

      expect(errorSpy).toHaveBeenCalledWith(
        'Something went wrong',
        undefined,
        expect.objectContaining({
          errorMessage: 'String error',
        }),
      );
    });

    it('should log error with unknown type error', () => {
      const errorSpy = jest.spyOn(logger, 'error');
      const unknownError = { code: 'UNKNOWN', message: 'Unknown error' };

      service.logError(logger, 'Something went wrong', unknownError);

      expect(errorSpy).toHaveBeenCalledWith(
        'Something went wrong',
        undefined,
        expect.objectContaining({
          errorMessage: '[object Object]',
        }),
      );
    });

    it('should include context in error log', () => {
      const errorSpy = jest.spyOn(logger, 'error');
      const error = new Error('Test error');
      const context = { eventId: 'evt_123', service: 'test-service' };

      service.logError(logger, 'Something went wrong', error, context);

      expect(errorSpy).toHaveBeenCalledWith(
        'Something went wrong',
        expect.anything(), // errorStack can be undefined or string
        expect.objectContaining({
          eventId: 'evt_123',
          service: 'test-service',
          errorMessage: 'Test error',
        }),
      );
    });

    it('should merge context with error details', () => {
      const errorSpy = jest.spyOn(logger, 'error');
      const error = new Error('Test error');
      error.stack = 'Stack trace';
      const context = { userId: 'user_456', page: 1 };

      service.logError(logger, 'Something went wrong', error, context);

      expect(errorSpy).toHaveBeenCalledWith(
        'Something went wrong',
        'Stack trace',
        expect.objectContaining({
          userId: 'user_456',
          page: 1,
          errorMessage: 'Test error',
          errorStack: 'Stack trace',
        }),
      );
    });

    it('should handle error without stack trace', () => {
      const errorSpy = jest.spyOn(logger, 'error');
      const error = new Error('Test error');
      delete (error as any).stack;

      service.logError(logger, 'Something went wrong', error);

      expect(errorSpy).toHaveBeenCalledWith(
        'Something went wrong',
        undefined,
        expect.objectContaining({
          errorMessage: 'Test error',
        }),
      );
      expect(errorSpy.mock.calls[0][2]).not.toHaveProperty('errorStack');
    });
  });

  describe('logWarning', () => {
    it('should log warning with message', () => {
      const warnSpy = jest.spyOn(logger, 'warn');

      service.logWarning(logger, 'Warning message');

      expect(warnSpy).toHaveBeenCalledWith('Warning message', undefined);
    });

    it('should log warning with context', () => {
      const warnSpy = jest.spyOn(logger, 'warn');
      const context = { eventId: 'evt_123', service: 'test-service' };

      service.logWarning(logger, 'Warning message', context);

      expect(warnSpy).toHaveBeenCalledWith('Warning message', context);
    });

    it('should log warning without context', () => {
      const warnSpy = jest.spyOn(logger, 'warn');

      service.logWarning(logger, 'Warning message');

      expect(warnSpy).toHaveBeenCalledWith('Warning message', undefined);
    });
  });

  describe('createContext', () => {
    it('should create context with eventId', () => {
      const context = service.createContext('evt_123');

      expect(context).toEqual({ eventId: 'evt_123' });
    });

    it('should create context with service', () => {
      const context = service.createContext(undefined, 'test-service');

      expect(context).toEqual({ service: 'test-service' });
    });

    it('should create context with eventId and service', () => {
      const context = service.createContext('evt_123', 'test-service');

      expect(context).toEqual({ eventId: 'evt_123', service: 'test-service' });
    });

    it('should create context with additional fields', () => {
      const context = service.createContext('evt_123', 'test-service', {
        userId: 'user_456',
        page: 1,
      });

      expect(context).toEqual({
        eventId: 'evt_123',
        service: 'test-service',
        userId: 'user_456',
        page: 1,
      });
    });

    it('should create context with only additional fields', () => {
      const context = service.createContext(undefined, undefined, {
        customField: 'value',
      });

      expect(context).toEqual({ customField: 'value' });
    });

    it('should create empty context when no parameters provided', () => {
      const context = service.createContext();

      expect(context).toEqual({});
    });

    it('should merge additional context with eventId and service', () => {
      const context = service.createContext('evt_123', 'test-service', {
        userId: 'user_456',
        service: 'override-service', // Should override
      });

      expect(context).toEqual({
        eventId: 'evt_123',
        service: 'override-service', // Additional context takes precedence
        userId: 'user_456',
      });
    });
  });

  describe('integration', () => {
    it('should work together with createContext', () => {
      const errorSpy = jest.spyOn(logger, 'error');
      const error = new Error('Test error');

      service.logError(
        logger,
        'Something went wrong',
        error,
        service.createContext('evt_123', 'test-service', { userId: 'user_456' }),
      );

      expect(errorSpy).toHaveBeenCalledWith(
        'Something went wrong',
        expect.anything(), // errorStack can be undefined or string
        expect.objectContaining({
          eventId: 'evt_123',
          service: 'test-service',
          userId: 'user_456',
          errorMessage: 'Test error',
        }),
      );
    });
  });
});

