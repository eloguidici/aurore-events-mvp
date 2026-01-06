import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception thrown when the system is under pressure and cannot accept events.
 * This can happen when the buffer becomes full between the capacity check and enqueue operation.
 *
 * @example
 * throw new ServiceUnavailableException();
 */
export class ServiceUnavailableException extends HttpException {
  constructor() {
    super(
      {
        status: 'service_unavailable',
        message: 'System under pressure. Please retry later.',
        errorCode: 'SERVICE_UNAVAILABLE',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
