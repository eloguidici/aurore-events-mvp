import { HttpStatus } from '@nestjs/common';

import { ServiceUnavailableException } from '../../exceptions/service-unavailable.exception';

describe('ServiceUnavailableException', () => {
  it('should create exception with correct status code', () => {
    const exception = new ServiceUnavailableException();

    expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('should include correct error structure', () => {
    const exception = new ServiceUnavailableException();
    const response = exception.getResponse() as any;

    expect(response.status).toBe('service_unavailable');
    expect(response.message).toBe('System under pressure. Please retry later.');
    expect(response.errorCode).toBe('SERVICE_UNAVAILABLE');
  });

  it('should be instance of HttpException', () => {
    const exception = new ServiceUnavailableException();

    expect(exception).toBeInstanceOf(ServiceUnavailableException);
  });
});

