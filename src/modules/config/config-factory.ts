import { envs } from './envs';
import {
  BatchWorkerConfig,
  BufferConfig,
  CheckpointConfig,
  CircuitBreakerConfig,
  DatabaseConfig,
  MetricsConfig,
  QueryConfig,
  RateLimitingConfig,
  RetentionConfig,
  ServerConfig,
  ServiceConfig,
  ShutdownConfig,
  ValidationConfig,
} from './interfaces';

/**
 * Factory functions to create configuration objects from envs
 * These functions transform the flat envs object into typed configuration objects
 */

export function createServerConfig(): ServerConfig {
  return {
    environment: envs.environment,
    port: envs.port,
    host: envs.host,
  };
}

export function createDatabaseConfig(): DatabaseConfig {
  return {
    host: envs.dbHost,
    port: envs.dbPort,
    username: envs.dbUsername,
    password: envs.dbPassword,
    database: envs.dbDatabase,
    synchronize: envs.dbSynchronize,
    logging: envs.dbLogging,
    poolMax: envs.dbPoolMax,
  };
}

export function createBatchWorkerConfig(): BatchWorkerConfig {
  return {
    batchSize: envs.batchSize,
    drainInterval: envs.drainInterval,
    maxRetries: envs.maxRetries,
  };
}

export function createBufferConfig(): BufferConfig {
  return {
    maxSize: envs.bufferMaxSize,
  };
}

export function createRetentionConfig(): RetentionConfig {
  return {
    days: envs.retentionDays,
    cronSchedule: envs.retentionCronSchedule,
  };
}

export function createQueryConfig(): QueryConfig {
  return {
    defaultLimit: envs.defaultQueryLimit,
    maxLimit: envs.maxQueryLimit,
    maxTimeRangeDays: envs.maxQueryTimeRangeDays,
  };
}

export function createServiceConfig(): ServiceConfig {
  return {
    nameMaxLength: envs.serviceNameMaxLength,
    retryAfterSeconds: envs.retryAfterSeconds,
  };
}

export function createValidationConfig(): ValidationConfig {
  return {
    messageMaxLength: envs.messageMaxLength,
    metadataMaxSizeKB: envs.metadataMaxSizeKB,
    batchChunkSize: envs.batchChunkSize,
  };
}

export function createCheckpointConfig(): CheckpointConfig {
  return {
    intervalMs: envs.checkpointIntervalMs,
  };
}

export function createCircuitBreakerConfig(): CircuitBreakerConfig {
  return {
    failureThreshold: envs.circuitBreakerFailureThreshold,
    successThreshold: envs.circuitBreakerSuccessThreshold,
    timeoutMs: envs.circuitBreakerTimeoutMs,
  };
}

export function createShutdownConfig(): ShutdownConfig {
  return {
    timeoutMs: envs.shutdownTimeoutMs,
  };
}

export function createMetricsConfig(): MetricsConfig {
  return {
    historyDefaultLimit: envs.metricsHistoryDefaultLimit,
    // Optional values with defaults can be added here
    cacheTtlMs: 60000, // 1 minute default
    persistenceIntervalMs: 60000, // 1 minute default
  };
}

export function createRateLimitingConfig(): RateLimitingConfig {
  return {
    ttlMs: envs.throttleTtlMs,
    globalLimit: envs.throttleGlobalLimit,
    ipLimit: envs.throttleIpLimit,
    queryLimit: envs.throttleQueryLimit,
    healthLimit: envs.throttleHealthLimit,
  };
}

