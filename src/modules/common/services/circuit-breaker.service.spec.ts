import { Test, TestingModule } from '@nestjs/testing';

import { CircuitBreakerConfig } from '../../config/interfaces/circuit-breaker-config.interface';
import { CONFIG_TOKENS } from '../../config/tokens/config.tokens';
import { CircuitBreakerService, CircuitState } from './circuit-breaker.service';
import { ERROR_LOGGER_SERVICE_TOKEN } from './interfaces/error-logger-service.token';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  const mockConfig: CircuitBreakerConfig = {
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 1000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircuitBreakerService,
        {
          provide: CONFIG_TOKENS.CIRCUIT_BREAKER,
          useValue: mockConfig,
        },
        {
          provide: ERROR_LOGGER_SERVICE_TOKEN,
          useValue: {
            logError: jest.fn(),
            logWarning: jest.fn(),
            createContext: jest.fn(),
          },
        },
      ],
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
