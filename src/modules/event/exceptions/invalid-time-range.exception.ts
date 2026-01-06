import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception thrown when time range validation fails
 * 'from' timestamp must be before 'to' timestamp
 */
export class InvalidTimeRangeException extends HttpException {
  constructor() {
    super(
      {
        status: 'error',
        message: "'from' timestamp must be before 'to' timestamp",
        errorCode: 'INVALID_TIME_RANGE',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
