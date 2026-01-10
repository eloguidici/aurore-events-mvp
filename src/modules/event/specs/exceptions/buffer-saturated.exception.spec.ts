import { HttpStatus } from '@nestjs/common';

import { BufferSaturatedException } from '../../exceptions/buffer-saturated.exception';

describe('BufferSaturatedException', () => {
  it('should create exception with correct status code', () => {
    const exception = new BufferSaturatedException(5);

    expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('should include retry_after in response', () => {
    const retryAfter = 10;
    const exception = new BufferSaturatedException(retryAfter);
    const response = exception.getResponse() as any;

    expect(response.retry_after).toBe(10);
  });

  it('should include correct error structure', () => {
    const exception = new BufferSaturatedException(5);
    const response = exception.getResponse() as any;

    expect(response.status).toBe('rate_limited');
    expect(response.message).toBe(
      'Buffer is full. Please retry in a few seconds.',
    );
    expect(response.errorCode).toBe('BUFFER_SATURATED');
    expect(response.retry_after).toBe(5);
  });

  it('should handle different retry after values', () => {
    const exception1 = new BufferSaturatedException(1);
    const exception2 = new BufferSaturatedException(60);

    const response1 = exception1.getResponse() as any;
    const response2 = exception2.getResponse() as any;

    expect(response1.retry_after).toBe(1);
    expect(response2.retry_after).toBe(60);
  });
});
