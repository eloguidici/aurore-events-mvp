import { Test, TestingModule } from '@nestjs/testing';

import { envs } from '../../config/envs';
import { CircuitBreakerService, CircuitState } from './circuit-breaker.service';

// Mock envs
jest.mock('../../config/envs', () => ({
  envs: {
    circuitBreakerFailureThreshold: 3,
    circuitBreakerSuccessThreshold: 2,
    circuitBreakerTimeoutMs: 1000,
  },
}));

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CircuitBreakerService],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should start in CLOSED state', () => {
    expect(service.getState()).toBe(CircuitState.CLOSED);
  });

  it('should open circuit after failure threshold', async () => {
    // Execute failing operations to trigger circuit opening
    for (let i = 0; i < 3; i++) {
      try {
        await service.execute(async () => {
          throw new Error('ECONNREFUSED: Connection refused');
        });
      } catch (error) {
        // Expected to fail
      }
    }

    // Circuit should be OPEN
    expect(service.getState()).toBe(CircuitState.OPEN);
  });

  it('should not count non-transient errors', async () => {
    // Execute non-transient error (validation error)
    try {
      await service.execute(async () => {
        throw new Error('Validation failed: invalid input');
      });
    } catch (error) {
      // Expected to fail
    }

    // Circuit should still be CLOSED (validation errors are not transient)
    expect(service.getState()).toBe(CircuitState.CLOSED);
  });

  it('should reset circuit breaker', () => {
    service.reset();
    expect(service.getState()).toBe(CircuitState.CLOSED);
    const metrics = service.getMetrics();
    expect(metrics.failureCount).toBe(0);
    expect(metrics.successCount).toBe(0);
  });
});
