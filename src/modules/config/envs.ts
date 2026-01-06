import * as joi from 'joi';

import 'dotenv/config';

// Define the interface for environment variables
interface EnvVars {
  NODE_ENV: string;
  PORT: number;
  HOST?: string;

  // Database Configuration
  DATABASE_PATH?: string;
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
  SQLITE_CHUNK_SIZE?: number;
}

// Define the schema for environment variables validation
// All parameters are REQUIRED - system will fail if any is missing
const envsSchema = joi
  .object({
    NODE_ENV: joi.string().valid('development', 'production', 'test').required(),
    PORT: joi.number().required(),
    HOST: joi.string().required(),

    // Database Configuration
    DATABASE_PATH: joi.string().required(),
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
    SQLITE_CHUNK_SIZE: joi.number().min(100).max(5000).required(),

    // Checkpoint Configuration
    CHECKPOINT_INTERVAL_MS: joi.number().min(1000).max(60000).required(),
  })
  .unknown(true);

// Validate environment variables
const { error, value } = envsSchema.validate({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  DATABASE_PATH: process.env.DATABASE_PATH,
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
    SQLITE_CHUNK_SIZE: process.env.SQLITE_CHUNK_SIZE,
    CHECKPOINT_INTERVAL_MS: process.env.CHECKPOINT_INTERVAL_MS,
});

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
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
  
  // Database Configuration
  databasePath: envVars.DATABASE_PATH,
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
  sqliteChunkSize: envVars.SQLITE_CHUNK_SIZE,

  // Checkpoint Configuration
  checkpointIntervalMs: envVars.CHECKPOINT_INTERVAL_MS,
};

