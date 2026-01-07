import { Logger } from '@nestjs/common';

import { ErrorLogger } from '../../utils/error-logger';

describe('ErrorLogger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('TestLogger');
    jest.clearAllMocks();
  });

  describe('logError', () => {
    it('should log error with Error object', () => {
      const errorSpy = jest.spyOn(logger, 'error');
      const error = new Error('Test error message');
      error.stack = 'Error stack trace';

      ErrorLogger.logError(logger, 'Something went wrong', error);

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

      ErrorLogger.logError(logger, 'Something went wrong', 'String error');

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

      ErrorLogger.logError(logger, 'Something went wrong', unknownError);

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

      ErrorLogger.logError(logger, 'Something went wrong', error, context);

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

      ErrorLogger.logError(logger, 'Something went wrong', error, context);

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

      ErrorLogger.logError(logger, 'Something went wrong', error);

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

      ErrorLogger.logWarning(logger, 'Warning message');

      expect(warnSpy).toHaveBeenCalledWith('Warning message', undefined);
    });

    it('should log warning with context', () => {
      const warnSpy = jest.spyOn(logger, 'warn');
      const context = { eventId: 'evt_123', service: 'test-service' };

      ErrorLogger.logWarning(logger, 'Warning message', context);

      expect(warnSpy).toHaveBeenCalledWith('Warning message', context);
    });

    it('should log warning without context', () => {
      const warnSpy = jest.spyOn(logger, 'warn');

      ErrorLogger.logWarning(logger, 'Warning message');

      expect(warnSpy).toHaveBeenCalledWith('Warning message', undefined);
    });
  });

  describe('createContext', () => {
    it('should create context with eventId', () => {
      const context = ErrorLogger.createContext('evt_123');

      expect(context).toEqual({ eventId: 'evt_123' });
    });

    it('should create context with service', () => {
      const context = ErrorLogger.createContext(undefined, 'test-service');

      expect(context).toEqual({ service: 'test-service' });
    });

    it('should create context with eventId and service', () => {
      const context = ErrorLogger.createContext('evt_123', 'test-service');

      expect(context).toEqual({ eventId: 'evt_123', service: 'test-service' });
    });

    it('should create context with additional fields', () => {
      const context = ErrorLogger.createContext(
        'evt_123',
        'test-service',
        { userId: 'user_456', page: 1 },
      );

      expect(context).toEqual({
        eventId: 'evt_123',
        service: 'test-service',
        userId: 'user_456',
        page: 1,
      });
    });

    it('should create context with only additional fields', () => {
      const context = ErrorLogger.createContext(undefined, undefined, {
        customField: 'value',
      });

      expect(context).toEqual({ customField: 'value' });
    });

    it('should create empty context when no parameters provided', () => {
      const context = ErrorLogger.createContext();

      expect(context).toEqual({});
    });

    it('should merge additional context with eventId and service', () => {
      const context = ErrorLogger.createContext('evt_123', 'test-service', {
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

  describe('createErrorContext (deprecated)', () => {
    it('should create context same as createContext', () => {
      const context1 = ErrorLogger.createContext('evt_123', 'test-service');
      const context2 = ErrorLogger.createErrorContext('evt_123', 'test-service');

      expect(context2).toEqual(context1);
    });

    it('should support all createContext parameters', () => {
      const context = ErrorLogger.createErrorContext(
        'evt_123',
        'test-service',
        { userId: 'user_456' },
      );

      expect(context).toEqual({
        eventId: 'evt_123',
        service: 'test-service',
        userId: 'user_456',
      });
    });
  });

  describe('integration', () => {
    it('should work together with createContext', () => {
      const errorSpy = jest.spyOn(logger, 'error');
      const error = new Error('Test error');

      ErrorLogger.logError(
        logger,
        'Something went wrong',
        error,
        ErrorLogger.createContext('evt_123', 'test-service', { userId: 'user_456' }),
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

