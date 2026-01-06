import { envs } from '../envs';

describe('Environment Configuration', () => {
  describe('Basic Configuration', () => {
    it('should have required environment variables', () => {
      expect(envs).toBeDefined();
      expect(typeof envs.environment).toBe('string');
      expect(typeof envs.port).toBe('number');
      expect(typeof envs.host).toBe('string');
    });

    it('should have valid port number', () => {
      expect(envs.port).toBeGreaterThan(0);
      expect(envs.port).toBeLessThan(65536);
    });

    it('should have valid environment value', () => {
      expect(['development', 'test', 'production']).toContain(envs.environment);
    });
  });

  describe('Database Configuration', () => {
    it('should have PostgreSQL database configuration', () => {
      expect(typeof envs.dbHost).toBe('string');
      expect(typeof envs.dbPort).toBe('number');
      expect(typeof envs.dbUsername).toBe('string');
      expect(typeof envs.dbPassword).toBe('string');
      expect(typeof envs.dbDatabase).toBe('string');
      expect(typeof envs.dbSynchronize).toBe('boolean');
      expect(typeof envs.dbLogging).toBe('boolean');
      expect(envs.dbHost.length).toBeGreaterThan(0);
      expect(envs.dbPort).toBeGreaterThan(0);
      expect(envs.dbPort).toBeLessThan(65536);
      expect(envs.dbUsername.length).toBeGreaterThan(0);
      expect(envs.dbPassword.length).toBeGreaterThan(0);
      expect(envs.dbDatabase.length).toBeGreaterThan(0);
    });
  });

  describe('Batch Worker Configuration', () => {
    it('should have batch worker configuration', () => {
      expect(typeof envs.batchSize).toBe('number');
      expect(typeof envs.drainInterval).toBe('number');
      expect(typeof envs.maxRetries).toBe('number');
    });

    it('should have valid batch worker values', () => {
      expect(envs.batchSize).toBeGreaterThan(0);
      expect(envs.batchSize).toBeLessThanOrEqual(10000);
      expect(envs.drainInterval).toBeGreaterThanOrEqual(100);
      expect(envs.drainInterval).toBeLessThanOrEqual(60000);
      expect(envs.maxRetries).toBeGreaterThanOrEqual(0);
      expect(envs.maxRetries).toBeLessThanOrEqual(10);
    });
  });

  describe('Buffer Configuration', () => {
    it('should have buffer configuration', () => {
      expect(typeof envs.bufferMaxSize).toBe('number');
      expect(envs.bufferMaxSize).toBeGreaterThan(0);
      expect(envs.bufferMaxSize).toBeLessThanOrEqual(1000000);
    });
  });

  describe('Retention Configuration', () => {
    it('should have retention configuration', () => {
      expect(typeof envs.retentionDays).toBe('number');
      expect(typeof envs.retentionCronSchedule).toBe('string');
      expect(envs.retentionDays).toBeGreaterThan(0);
      expect(envs.retentionDays).toBeLessThanOrEqual(3650);
      expect(envs.retentionCronSchedule.length).toBeGreaterThan(0);
    });
  });

  describe('Query Configuration', () => {
    it('should have query configuration', () => {
      expect(typeof envs.defaultQueryLimit).toBe('number');
      expect(typeof envs.maxQueryLimit).toBe('number');
      expect(envs.defaultQueryLimit).toBeGreaterThan(0);
      expect(envs.maxQueryLimit).toBeGreaterThanOrEqual(envs.defaultQueryLimit);
    });
  });

  describe('Service Configuration', () => {
    it('should have service configuration', () => {
      expect(typeof envs.serviceNameMaxLength).toBe('number');
      expect(typeof envs.retryAfterSeconds).toBe('number');
      expect(envs.serviceNameMaxLength).toBeGreaterThanOrEqual(10);
      expect(envs.serviceNameMaxLength).toBeLessThanOrEqual(500);
      expect(envs.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(envs.retryAfterSeconds).toBeLessThanOrEqual(300);
    });
  });

  describe('Circuit Breaker Configuration', () => {
    it('should have circuit breaker configuration', () => {
      expect(typeof envs.circuitBreakerFailureThreshold).toBe('number');
      expect(typeof envs.circuitBreakerSuccessThreshold).toBe('number');
      expect(typeof envs.circuitBreakerTimeoutMs).toBe('number');
    });

    it('should have valid circuit breaker values', () => {
      expect(envs.circuitBreakerFailureThreshold).toBeGreaterThanOrEqual(1);
      expect(envs.circuitBreakerFailureThreshold).toBeLessThanOrEqual(20);
      expect(envs.circuitBreakerSuccessThreshold).toBeGreaterThanOrEqual(1);
      expect(envs.circuitBreakerSuccessThreshold).toBeLessThanOrEqual(10);
      expect(envs.circuitBreakerTimeoutMs).toBeGreaterThanOrEqual(1000);
      expect(envs.circuitBreakerTimeoutMs).toBeLessThanOrEqual(300000);
    });
  });

  describe('Shutdown Configuration', () => {
    it('should have shutdown configuration', () => {
      expect(typeof envs.shutdownTimeoutMs).toBe('number');
      expect(envs.shutdownTimeoutMs).toBeGreaterThanOrEqual(5000);
      expect(envs.shutdownTimeoutMs).toBeLessThanOrEqual(300000);
    });
  });

  describe('Metrics Configuration', () => {
    it('should have metrics configuration', () => {
      expect(typeof envs.metricsHistoryDefaultLimit).toBe('number');
      expect(envs.metricsHistoryDefaultLimit).toBeGreaterThanOrEqual(10);
      expect(envs.metricsHistoryDefaultLimit).toBeLessThanOrEqual(1000);
    });
  });

  describe('Rate Limiting Configuration', () => {
    it('should have rate limiting configuration', () => {
      expect(typeof envs.throttleTtlMs).toBe('number');
      expect(typeof envs.throttleGlobalLimit).toBe('number');
      expect(typeof envs.throttleIpLimit).toBe('number');
    });

    it('should have valid rate limiting values', () => {
      expect(envs.throttleTtlMs).toBeGreaterThanOrEqual(1000);
      expect(envs.throttleTtlMs).toBeLessThanOrEqual(3600000);
      expect(envs.throttleGlobalLimit).toBeGreaterThanOrEqual(1000);
      expect(envs.throttleGlobalLimit).toBeLessThanOrEqual(1000000);
      expect(envs.throttleIpLimit).toBeGreaterThanOrEqual(100);
      expect(envs.throttleIpLimit).toBeLessThanOrEqual(100000);
    });

    it('should validate throttle query limit', () => {
      expect(typeof envs.throttleQueryLimit).toBe('number');
      expect(envs.throttleQueryLimit).toBeGreaterThanOrEqual(10);
      expect(envs.throttleQueryLimit).toBeLessThanOrEqual(10000);
    });

    it('should validate throttle health limit', () => {
      expect(typeof envs.throttleHealthLimit).toBe('number');
      expect(envs.throttleHealthLimit).toBeGreaterThanOrEqual(10);
      expect(envs.throttleHealthLimit).toBeLessThanOrEqual(1000);
    });

    it('should validate database pool max connections', () => {
      expect(typeof envs.dbPoolMax).toBe('number');
      expect(envs.dbPoolMax).toBeGreaterThanOrEqual(5);
      expect(envs.dbPoolMax).toBeLessThanOrEqual(100);
    });
  });
});

