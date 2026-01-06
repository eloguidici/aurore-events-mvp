import 'dotenv/config';

import * as joi from 'joi';

// Define the interface for environment variables
interface EnvVars {
  NODE_ENV: string;
  PORT: number;
  HOST?: string;

  // Database Configuration (PostgreSQL only)
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_DATABASE: string;
  DB_SYNCHRONIZE?: string;
  DB_LOGGING?: string;

  // Batch Worker Configuration
  BATCH_SIZE?: number;
  DRAIN_INTERVAL?: number;
  MAX_RETRIES?: number;

  // Buffer Configuration
  BUFFER_MAX_SIZE?: number;

  // Retention Configuration
  RETENTION_DAYS: number;
  RETENTION_CRON_SCHEDULE: string;

  // Checkpoint Configuration
  CHECKPOINT_INTERVAL_MS: number;

  // Query Configuration
  DEFAULT_QUERY_LIMIT?: number;
  MAX_QUERY_LIMIT?: number;

  // Service Configuration
  SERVICE_NAME_MAX_LENGTH?: number;
  RETRY_AFTER_SECONDS?: number;

  // Validation Configuration
  MESSAGE_MAX_LENGTH?: number;
  METADATA_MAX_SIZE_KB?: number;
  BATCH_CHUNK_SIZE?: number;

  // Circuit Breaker Configuration
  CIRCUIT_BREAKER_FAILURE_THRESHOLD?: number;
  CIRCUIT_BREAKER_SUCCESS_THRESHOLD?: number;
  CIRCUIT_BREAKER_TIMEOUT_MS?: number;

  // Shutdown Configuration
  SHUTDOWN_TIMEOUT_MS?: number;

  // Metrics Configuration
  METRICS_HISTORY_DEFAULT_LIMIT?: number;

  // Rate Limiting Configuration
  THROTTLE_TTL_MS?: number;
  THROTTLE_GLOBAL_LIMIT?: number;
  THROTTLE_IP_LIMIT?: number;
  THROTTLE_QUERY_LIMIT?: number;
  THROTTLE_HEALTH_LIMIT?: number;

  // Database Connection Pool Configuration
  DB_POOL_MAX?: number;
}

// Define the schema for environment variables validation
// All parameters are REQUIRED - system will fail if any is missing
const envsSchema = joi
  .object({
    NODE_ENV: joi
      .string()
      .valid('development', 'production', 'test')
      .required(),
    PORT: joi.number().required(),
    HOST: joi.string().required(),

    // Database Configuration (PostgreSQL only)
    DB_HOST: joi.string().required(),
    DB_PORT: joi.number().port().required(),
    DB_USERNAME: joi.string().required(),
    DB_PASSWORD: joi.string().required(),
    DB_DATABASE: joi.string().required(),
    DB_SYNCHRONIZE: joi
      .alternatives()
      .try(
        joi.boolean(),
        joi
          .string()
          .valid('true', 'false', '1', '0', 'True', 'False', 'TRUE', 'FALSE'),
      )
      .required()
      .custom((value) => {
        if (typeof value === 'string') {
          const lowerValue = value.toLowerCase().trim();
          return lowerValue === 'true' || lowerValue === '1';
        }
        return Boolean(value);
      }, 'boolean conversion'),
    DB_LOGGING: joi
      .alternatives()
      .try(
        joi.boolean(),
        joi
          .string()
          .valid('true', 'false', '1', '0', 'True', 'False', 'TRUE', 'FALSE'),
      )
      .required()
      .custom((value, helpers) => {
        if (value === undefined) {
          return helpers.error('any.required');
        }
        if (typeof value === 'string') {
          const lowerValue = value.toLowerCase().trim();
          return lowerValue === 'true' || lowerValue === '1';
        }
        return Boolean(value);
      }, 'boolean conversion'),

    // Batch Worker Configuration
    BATCH_SIZE: joi.number().min(1).max(10000).required(),
    DRAIN_INTERVAL: joi.number().min(100).max(60000).required(),
    MAX_RETRIES: joi.number().min(0).max(10).required(),

    // Buffer Configuration
    BUFFER_MAX_SIZE: joi.number().min(100).max(1000000).required(),

    // Retention Configuration
    RETENTION_DAYS: joi.number().min(1).max(3650).required(),
    RETENTION_CRON_SCHEDULE: joi.string().required(),

    // Query Configuration
    DEFAULT_QUERY_LIMIT: joi.number().min(1).max(10000).required(),
    MAX_QUERY_LIMIT: joi.number().min(1).max(10000).required(),

    // Service Configuration
    SERVICE_NAME_MAX_LENGTH: joi.number().min(10).max(500).required(),
    RETRY_AFTER_SECONDS: joi.number().min(1).max(300).required(),

    // Validation Configuration
    MESSAGE_MAX_LENGTH: joi.number().min(100).max(10000).required(),
    METADATA_MAX_SIZE_KB: joi.number().min(1).max(100).required(),
    BATCH_CHUNK_SIZE: joi.number().min(100).max(10000).required(),

    // Checkpoint Configuration
    CHECKPOINT_INTERVAL_MS: joi.number().min(1000).max(60000).required(),

    // Circuit Breaker Configuration
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: joi.number().min(1).max(20).required(),
    CIRCUIT_BREAKER_SUCCESS_THRESHOLD: joi.number().min(1).max(10).required(),
    CIRCUIT_BREAKER_TIMEOUT_MS: joi.number().min(1000).max(300000).required(),

    // Shutdown Configuration
    SHUTDOWN_TIMEOUT_MS: joi.number().min(5000).max(300000).required(),

    // Metrics Configuration
    METRICS_HISTORY_DEFAULT_LIMIT: joi.number().min(10).max(1000).required(),

    // Rate Limiting Configuration
    THROTTLE_TTL_MS: joi.number().min(1000).max(3600000).required(),
    THROTTLE_GLOBAL_LIMIT: joi.number().min(1000).max(1000000).required(),
    THROTTLE_IP_LIMIT: joi.number().min(100).max(100000).required(),
    THROTTLE_QUERY_LIMIT: joi.number().min(10).max(10000).required(),
    THROTTLE_HEALTH_LIMIT: joi.number().min(10).max(1000).required(),

    // Database Connection Pool Configuration
    DB_POOL_MAX: joi.number().min(5).max(100).required(),
  })
  .unknown(true);

// Validate environment variables
const { error, value } = envsSchema.validate({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USERNAME: process.env.DB_USERNAME,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_DATABASE: process.env.DB_DATABASE,
  DB_SYNCHRONIZE: process.env.DB_SYNCHRONIZE,
  DB_LOGGING: process.env.DB_LOGGING,
  BATCH_SIZE: process.env.BATCH_SIZE,
  DRAIN_INTERVAL: process.env.DRAIN_INTERVAL,
  MAX_RETRIES: process.env.MAX_RETRIES,
  BUFFER_MAX_SIZE: process.env.BUFFER_MAX_SIZE,
  RETENTION_DAYS: process.env.RETENTION_DAYS,
  RETENTION_CRON_SCHEDULE: process.env.RETENTION_CRON_SCHEDULE,
  DEFAULT_QUERY_LIMIT: process.env.DEFAULT_QUERY_LIMIT,
  MAX_QUERY_LIMIT: process.env.MAX_QUERY_LIMIT,
  SERVICE_NAME_MAX_LENGTH: process.env.SERVICE_NAME_MAX_LENGTH,
  RETRY_AFTER_SECONDS: process.env.RETRY_AFTER_SECONDS,
  MESSAGE_MAX_LENGTH: process.env.MESSAGE_MAX_LENGTH,
  METADATA_MAX_SIZE_KB: process.env.METADATA_MAX_SIZE_KB,
  BATCH_CHUNK_SIZE: process.env.BATCH_CHUNK_SIZE,
  CHECKPOINT_INTERVAL_MS: process.env.CHECKPOINT_INTERVAL_MS,
  CIRCUIT_BREAKER_FAILURE_THRESHOLD:
    process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  CIRCUIT_BREAKER_SUCCESS_THRESHOLD:
    process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
  CIRCUIT_BREAKER_TIMEOUT_MS: process.env.CIRCUIT_BREAKER_TIMEOUT_MS,
  SHUTDOWN_TIMEOUT_MS: process.env.SHUTDOWN_TIMEOUT_MS,
  METRICS_HISTORY_DEFAULT_LIMIT: process.env.METRICS_HISTORY_DEFAULT_LIMIT,
  THROTTLE_TTL_MS: process.env.THROTTLE_TTL_MS,
  THROTTLE_GLOBAL_LIMIT: process.env.THROTTLE_GLOBAL_LIMIT,
  THROTTLE_IP_LIMIT: process.env.THROTTLE_IP_LIMIT,
  THROTTLE_QUERY_LIMIT: process.env.THROTTLE_QUERY_LIMIT,
  THROTTLE_HEALTH_LIMIT: process.env.THROTTLE_HEALTH_LIMIT,
  DB_POOL_MAX: process.env.DB_POOL_MAX,
});

if (error) {
  const errorMessage = error.details
    ? error.details.map((detail) => detail.message).join(', ')
    : error.message;
  throw new Error(
    `Config validation error: ${errorMessage}. Please ensure all required environment variables are set in your .env file.`,
  );
}

// Assign validated environment variables to the envVars object
const envVars: EnvVars = value;

// Helper function to safely convert to boolean
const toBoolean = (value: any): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase().trim();
    return lowerValue === 'true' || lowerValue === '1';
  }
  return Boolean(value);
};

// Export environment variables
// All values are required - validation ensures they exist
export const envs = {
  environment: envVars.NODE_ENV,
  port: envVars.PORT,
  host: envVars.HOST,

  // Database Configuration (PostgreSQL)
  dbHost: envVars.DB_HOST,
  dbPort: envVars.DB_PORT,
  dbUsername: envVars.DB_USERNAME,
  dbPassword: envVars.DB_PASSWORD,
  dbDatabase: envVars.DB_DATABASE,
  dbSynchronize: toBoolean(envVars.DB_SYNCHRONIZE),
  dbLogging: toBoolean(envVars.DB_LOGGING),

  // Batch Worker Configuration
  batchSize: envVars.BATCH_SIZE,
  drainInterval: envVars.DRAIN_INTERVAL,
  maxRetries: envVars.MAX_RETRIES,

  // Buffer Configuration
  bufferMaxSize: envVars.BUFFER_MAX_SIZE,

  // Retention Configuration
  retentionDays: envVars.RETENTION_DAYS,
  retentionCronSchedule: envVars.RETENTION_CRON_SCHEDULE,

  // Query Configuration
  defaultQueryLimit: envVars.DEFAULT_QUERY_LIMIT,
  maxQueryLimit: envVars.MAX_QUERY_LIMIT,

  // Service Configuration
  serviceNameMaxLength: envVars.SERVICE_NAME_MAX_LENGTH,
  retryAfterSeconds: envVars.RETRY_AFTER_SECONDS,

  // Validation Configuration
  messageMaxLength: envVars.MESSAGE_MAX_LENGTH,
  metadataMaxSizeKB: envVars.METADATA_MAX_SIZE_KB,
  batchChunkSize: envVars.BATCH_CHUNK_SIZE,

  // Checkpoint Configuration
  checkpointIntervalMs: envVars.CHECKPOINT_INTERVAL_MS,

  // Circuit Breaker Configuration
  circuitBreakerFailureThreshold: envVars.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  circuitBreakerSuccessThreshold: envVars.CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
  circuitBreakerTimeoutMs: envVars.CIRCUIT_BREAKER_TIMEOUT_MS,

  // Shutdown Configuration
  shutdownTimeoutMs: envVars.SHUTDOWN_TIMEOUT_MS,

  // Metrics Configuration
  metricsHistoryDefaultLimit: envVars.METRICS_HISTORY_DEFAULT_LIMIT,

  // Rate Limiting Configuration
  throttleTtlMs: envVars.THROTTLE_TTL_MS,
  throttleGlobalLimit: envVars.THROTTLE_GLOBAL_LIMIT,
  throttleIpLimit: envVars.THROTTLE_IP_LIMIT,
  throttleQueryLimit: envVars.THROTTLE_QUERY_LIMIT,
  throttleHealthLimit: envVars.THROTTLE_HEALTH_LIMIT,

  // Database Connection Pool Configuration
  dbPoolMax: envVars.DB_POOL_MAX,
};
