import { Logger } from '@nestjs/common';

/**
 * Interface for Error Logger Service
 * Defines the contract for standardized error logging
 */
export interface IErrorLoggerService {
  /**
   * Log an error with standardized format including context
   *
   * @param logger - Logger instance
   * @param message - Error message
   * @param error - Error object or error message string
   * @param context - Additional context object (eventId, service, etc.)
   */
  logError(
    logger: Logger,
    message: string,
    error: Error | string | unknown,
    context?: Record<string, any>,
  ): void;

  /**
   * Log a warning with standardized format including context
   *
   * @param logger - Logger instance
   * @param message - Warning message
   * @param context - Additional context object (eventId, service, etc.)
   */
  logWarning(
    logger: Logger,
    message: string,
    context?: Record<string, any>,
  ): void;

  /**
   * Helper to create error context object with common fields
   *
   * @param eventId - Event ID (if applicable)
   * @param service - Service name (if applicable)
   * @param additionalContext - Any additional context fields
   * @returns Context object for error logging
   */
  createContext(
    eventId?: string,
    service?: string,
    additionalContext?: Record<string, any>,
  ): Record<string, any>;
}
