import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Logger } from '@nestjs/common';

/**
 * Creates and configures the global ValidationPipe
 * Invalid events are rejected at the edge (400) and never enter the pipeline
 *
 * @returns Configured ValidationPipe instance
 */
export function createValidationPipe(): ValidationPipe {
  const logger = new Logger('ValidationPipe');

  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      // Log rejected invalid events (without PII if needed)
      const errorMessages = errors.map((err) => ({
        field: err.property,
        constraints: err.constraints,
      }));

      logger.warn('Invalid event rejected at edge', {
        reason: 'validation_failed',
        errors: errorMessages,
      });

      return new BadRequestException({
        status: 'error',
        message: 'Invalid event schema',
        errorCode: 'INVALID_EVENT',
        errors: errorMessages,
      });
    },
  });
}
