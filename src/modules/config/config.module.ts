import { Global, Module } from '@nestjs/common';

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
} from './config-factory';
import { CONFIG_TOKENS } from './tokens/config.tokens';

/**
 * Configuration Module
 *
 * Provides typed configuration objects for dependency injection.
 * All configuration is derived from environment variables (validated in envs.ts).
 *
 * This module is GLOBAL, meaning it's available to all modules without explicit import.
 *
 * Usage in services:
 * ```typescript
 * constructor(
 *   @Inject(CONFIG_TOKENS.CIRCUIT_BREAKER)
 *   private readonly config: CircuitBreakerConfig,
 * ) {}
 * ```
 */
@Global()
@Module({
  providers: [
    // Server configuration
    {
      provide: CONFIG_TOKENS.SERVER,
      useFactory: createServerConfig,
    },
    // Database configuration
    {
      provide: CONFIG_TOKENS.DATABASE,
      useFactory: createDatabaseConfig,
    },
    // Batch worker configuration
    {
      provide: CONFIG_TOKENS.BATCH_WORKER,
      useFactory: createBatchWorkerConfig,
    },
    // Buffer configuration
    {
      provide: CONFIG_TOKENS.BUFFER,
      useFactory: createBufferConfig,
    },
    // Retention configuration
    {
      provide: CONFIG_TOKENS.RETENTION,
      useFactory: createRetentionConfig,
    },
    // Query configuration
    {
      provide: CONFIG_TOKENS.QUERY,
      useFactory: createQueryConfig,
    },
    // Service configuration
    {
      provide: CONFIG_TOKENS.SERVICE,
      useFactory: createServiceConfig,
    },
    // Validation configuration
    {
      provide: CONFIG_TOKENS.VALIDATION,
      useFactory: createValidationConfig,
    },
    // Checkpoint configuration
    {
      provide: CONFIG_TOKENS.CHECKPOINT,
      useFactory: createCheckpointConfig,
    },
    // Circuit breaker configuration
    {
      provide: CONFIG_TOKENS.CIRCUIT_BREAKER,
      useFactory: createCircuitBreakerConfig,
    },
    // Shutdown configuration
    {
      provide: CONFIG_TOKENS.SHUTDOWN,
      useFactory: createShutdownConfig,
    },
    // Metrics configuration
    {
      provide: CONFIG_TOKENS.METRICS,
      useFactory: createMetricsConfig,
    },
    // Rate limiting configuration
    {
      provide: CONFIG_TOKENS.RATE_LIMITING,
      useFactory: createRateLimitingConfig,
    },
  ],
  exports: [
    CONFIG_TOKENS.SERVER,
    CONFIG_TOKENS.DATABASE,
    CONFIG_TOKENS.BATCH_WORKER,
    CONFIG_TOKENS.BUFFER,
    CONFIG_TOKENS.RETENTION,
    CONFIG_TOKENS.QUERY,
    CONFIG_TOKENS.SERVICE,
    CONFIG_TOKENS.VALIDATION,
    CONFIG_TOKENS.CHECKPOINT,
    CONFIG_TOKENS.CIRCUIT_BREAKER,
    CONFIG_TOKENS.SHUTDOWN,
    CONFIG_TOKENS.METRICS,
    CONFIG_TOKENS.RATE_LIMITING,
  ],
})
export class ConfigModule {}
