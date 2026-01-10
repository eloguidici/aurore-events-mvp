import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';

import { IErrorLoggerService } from './interfaces/error-logger-service.interface';

/**
 * Standardized error logging service
 * Ensures consistent error log format across the application
 *
 * Benefits:
 * - Consistent error format across all services
 * - Structured context (eventId, service, etc.) for better debugging
 * - Single place to modify error logging format
 * - Injectable service for better testability
 */
@Injectable()
export class ErrorLoggerService implements IErrorLoggerService {
  /**
   * Log an error with standardized format including context
   *
   * @param logger - Logger instance
   * @param message - Error message
   * @param error - Error object or error message string
   * @param context - Additional context object (eventId, service, etc.)
   *                  Can be a simple object or use createContext() helper
   */
  logError(
    logger: Logger,
    message: string,
    error: Error | string | unknown,
    context?: Record<string, any>,
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Build structured context object (not stringified - Logger handles it)
    const logContext: Record<string, any> = {
      ...context,
      errorMessage,
      ...(errorStack && { errorStack }),
    };

    // Pass object directly - NestJS Logger will handle serialization
    logger.error(message, errorStack, logContext);
  }

  /**
   * Log a warning with standardized format including context
   *
   * @param logger - Logger instance
   * @param message - Warning message
   * @param context - Additional context object (eventId, service, etc.)
   *                  Can be a simple object or use createContext() helper
   */
  logWarning(
    logger: Logger,
    message: string,
    context?: Record<string, any>,
  ): void {
    // Pass object directly - NestJS Logger will handle serialization
    logger.warn(message, context);
  }

  /**
   * Helper to create error context object with common fields
   * Makes it easier to include eventId and service consistently
   *
   * @param eventId - Event ID (if applicable)
   * @param service - Service name (if applicable)
   * @param additionalContext - Any additional context fields
   * @returns Context object for error logging
   *
   * @example
   * // Simple usage
   * errorLoggerService.logError(logger, 'Error', error, { key: 'value' });
   *
   * // With helper for common fields
   * errorLoggerService.logError(logger, 'Error', error,
   *   errorLoggerService.createContext('evt_123', 'my-service', { page: 1 })
   * );
   */
  createContext(
    eventId?: string,
    service?: string,
    additionalContext?: Record<string, any>,
  ): Record<string, any> {
    return {
      ...(eventId && { eventId }),
      ...(service && { service }),
      ...additionalContext,
    };
  }
}
