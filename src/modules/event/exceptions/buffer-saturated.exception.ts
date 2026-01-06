import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception thrown when the event buffer is full and cannot accept more events.
 * This implements backpressure by rejecting new events with a 429 status code.
 * 
 * @example
 * throw new BufferSaturatedException(5); // retry after 5 seconds
 */
export class BufferSaturatedException extends HttpException {
  constructor(retryAfter: number) {
    super(
      {
        status: 'rate_limited',
        message: 'Buffer is full. Please retry in a few seconds.',
        retry_after: retryAfter,
        errorCode: 'BUFFER_SATURATED',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

