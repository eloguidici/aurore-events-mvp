import { HttpStatus } from '@nestjs/common';

import { InvalidTimeRangeException } from '../../exceptions/invalid-time-range.exception';

describe('InvalidTimeRangeException', () => {
  it('should create exception with correct status code', () => {
    const exception = new InvalidTimeRangeException();

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('should include correct error structure', () => {
    const exception = new InvalidTimeRangeException();
    const response = exception.getResponse() as any;

    expect(response.status).toBe('error');
    expect(response.message).toBe(
      "'from' timestamp must be before 'to' timestamp",
    );
    expect(response.errorCode).toBe('INVALID_TIME_RANGE');
  });

  it('should be instance of HttpException', () => {
    const exception = new InvalidTimeRangeException();

    expect(exception).toBeInstanceOf(InvalidTimeRangeException);
  });
});
