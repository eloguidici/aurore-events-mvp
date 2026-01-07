import {
  createBatchWorkerConfig,
  createBufferConfig,
  createCheckpointConfig,
  createCircuitBreakerConfig,
  createDatabaseConfig,
  createMetricsConfig,
  createQueryConfig,
  createRateLimitingConfig,
  createRetentionConfig,
  createServerConfig,
  createServiceConfig,
  createShutdownConfig,
  createValidationConfig,
} from '../config-factory';
import { envs } from '../envs';

describe('ConfigFactory', () => {
  describe('createServerConfig', () => {
    it('should create server config from envs', () => {
      const config = createServerConfig();

      expect(config).toEqual({
        environment: envs.environment,
        port: envs.port,
        host: envs.host,
      });
      expect(typeof config.environment).toBe('string');
      expect(typeof config.port).toBe('number');
      expect(typeof config.host).toBe('string');
    });
  });

  describe('createDatabaseConfig', () => {
    it('should create database config from envs', () => {
      const config = createDatabaseConfig();

      expect(config).toEqual({
        host: envs.dbHost,
        port: envs.dbPort,
        username: envs.dbUsername,
        password: envs.dbPassword,
        database: envs.dbDatabase,
        synchronize: envs.dbSynchronize,
        logging: envs.dbLogging,
        poolMax: envs.dbPoolMax,
      });
      expect(typeof config.host).toBe('string');
      expect(typeof config.port).toBe('number');
      expect(typeof config.username).toBe('string');
      expect(typeof config.password).toBe('string');
      expect(typeof config.database).toBe('string');
      expect(typeof config.synchronize).toBe('boolean');
      expect(typeof config.logging).toBe('boolean');
      expect(typeof config.poolMax).toBe('number');
    });
  });

  describe('createBatchWorkerConfig', () => {
    it('should create batch worker config from envs', () => {
      const config = createBatchWorkerConfig();

      expect(config).toEqual({
        batchSize: envs.batchSize,
        drainInterval: envs.drainInterval,
        maxRetries: envs.maxRetries,
      });
      expect(typeof config.batchSize).toBe('number');
      expect(typeof config.drainInterval).toBe('number');
      expect(typeof config.maxRetries).toBe('number');
    });
  });

  describe('createBufferConfig', () => {
    it('should create buffer config from envs', () => {
      const config = createBufferConfig();

      expect(config).toEqual({
        maxSize: envs.bufferMaxSize,
      });
      expect(typeof config.maxSize).toBe('number');
    });
  });

  describe('createRetentionConfig', () => {
    it('should create retention config from envs', () => {
      const config = createRetentionConfig();

      expect(config).toEqual({
        days: envs.retentionDays,
        cronSchedule: envs.retentionCronSchedule,
      });
      expect(typeof config.days).toBe('number');
      expect(typeof config.cronSchedule).toBe('string');
    });
  });

  describe('createQueryConfig', () => {
    it('should create query config from envs', () => {
      const config = createQueryConfig();

      expect(config).toEqual({
        defaultLimit: envs.defaultQueryLimit,
        maxLimit: envs.maxQueryLimit,
        maxTimeRangeDays: envs.maxQueryTimeRangeDays,
      });
      expect(typeof config.defaultLimit).toBe('number');
      expect(typeof config.maxLimit).toBe('number');
      expect(typeof config.maxTimeRangeDays).toBe('number');
    });
  });

  describe('createServiceConfig', () => {
    it('should create service config from envs', () => {
      const config = createServiceConfig();

      expect(config).toEqual({
        nameMaxLength: envs.serviceNameMaxLength,
        retryAfterSeconds: envs.retryAfterSeconds,
      });
      expect(typeof config.nameMaxLength).toBe('number');
      expect(typeof config.retryAfterSeconds).toBe('number');
    });
  });

  describe('createValidationConfig', () => {
    it('should create validation config from envs', () => {
      const config = createValidationConfig();

      expect(config).toEqual({
        messageMaxLength: envs.messageMaxLength,
        metadataMaxSizeKB: envs.metadataMaxSizeKB,
        batchChunkSize: envs.batchChunkSize,
      });
      expect(typeof config.messageMaxLength).toBe('number');
      expect(typeof config.metadataMaxSizeKB).toBe('number');
      expect(typeof config.batchChunkSize).toBe('number');
    });
  });

  describe('createCheckpointConfig', () => {
    it('should create checkpoint config from envs', () => {
      const config = createCheckpointConfig();

      expect(config).toEqual({
        intervalMs: envs.checkpointIntervalMs,
      });
      expect(typeof config.intervalMs).toBe('number');
    });
  });

  describe('createCircuitBreakerConfig', () => {
    it('should create circuit breaker config from envs', () => {
      const config = createCircuitBreakerConfig();

      expect(config).toEqual({
        failureThreshold: envs.circuitBreakerFailureThreshold,
        successThreshold: envs.circuitBreakerSuccessThreshold,
        timeoutMs: envs.circuitBreakerTimeoutMs,
      });
      expect(typeof config.failureThreshold).toBe('number');
      expect(typeof config.successThreshold).toBe('number');
      expect(typeof config.timeoutMs).toBe('number');
    });
  });

  describe('createShutdownConfig', () => {
    it('should create shutdown config from envs', () => {
      const config = createShutdownConfig();

      expect(config).toEqual({
        timeoutMs: envs.shutdownTimeoutMs,
      });
      expect(typeof config.timeoutMs).toBe('number');
    });
  });

  describe('createMetricsConfig', () => {
    it('should create metrics config from envs with default values', () => {
      const config = createMetricsConfig();

      expect(config).toEqual({
        historyDefaultLimit: envs.metricsHistoryDefaultLimit,
        cacheTtlMs: 60000, // Default value
        persistenceIntervalMs: 60000, // Default value
      });
      expect(typeof config.historyDefaultLimit).toBe('number');
      expect(config.cacheTtlMs).toBe(60000);
      expect(config.persistenceIntervalMs).toBe(60000);
    });

    it('should always use default values for cacheTtlMs and persistenceIntervalMs', () => {
      const config1 = createMetricsConfig();
      const config2 = createMetricsConfig();

      expect(config1.cacheTtlMs).toBe(60000);
      expect(config1.persistenceIntervalMs).toBe(60000);
      expect(config2.cacheTtlMs).toBe(60000);
      expect(config2.persistenceIntervalMs).toBe(60000);
    });
  });

  describe('createRateLimitingConfig', () => {
    it('should create rate limiting config from envs', () => {
      const config = createRateLimitingConfig();

      expect(config).toEqual({
        ttlMs: envs.throttleTtlMs,
        globalLimit: envs.throttleGlobalLimit,
        ipLimit: envs.throttleIpLimit,
        queryLimit: envs.throttleQueryLimit,
        healthLimit: envs.throttleHealthLimit,
      });
      expect(typeof config.ttlMs).toBe('number');
      expect(typeof config.globalLimit).toBe('number');
      expect(typeof config.ipLimit).toBe('number');
      expect(typeof config.queryLimit).toBe('number');
      expect(typeof config.healthLimit).toBe('number');
    });
  });
});

