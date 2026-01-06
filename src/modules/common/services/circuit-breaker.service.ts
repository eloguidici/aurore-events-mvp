import { Injectable, Logger } from '@nestjs/common';

import { envs } from '../../config/envs';
import { ICircuitBreakerService } from './interfaces/circuit-breaker-service.interface';
import { ErrorLogger } from '../utils/error-logger';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Circuit is open, rejecting requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening circuit
  successThreshold: number; // Number of successes in HALF_OPEN to close circuit
  timeout: number; // Time in ms to wait before trying HALF_OPEN
}

/**
 * Circuit breaker service for database operations
 * Prevents cascading failures when database is down
 */
@Injectable()
export class CircuitBreakerService implements ICircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private readonly config: CircuitBreakerConfig;

  constructor() {
    // Configuration from environment variables
    this.config = {
      failureThreshold: envs.circuitBreakerFailureThreshold,
      successThreshold: envs.circuitBreakerSuccessThreshold,
      timeout: envs.circuitBreakerTimeoutMs,
    };
  }

  /**
   * Execute operation with circuit breaker protection
   *
   * @param operation - Async operation to execute
   * @returns Result of operation
   * @throws Error if circuit is open or operation fails
   */
  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has passed to try HALF_OPEN
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime >= this.config.timeout
      ) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        this.logger.log('Circuit breaker: Moving to HALF_OPEN state');
      } else {
        throw new Error(
          'Circuit breaker is OPEN - database operations temporarily unavailable',
        );
      }
    }

    try {
      // Execute operation
      const result = await operation();

      // On success
      this.onSuccess();
      return result;
    } catch (error) {
      // Only count transient errors (connection issues, timeouts, etc.)
      // Permanent errors (validation, not found, etc.) should not trigger circuit breaker
      if (this.isTransientError(error)) {
        this.onFailure();
      }
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        this.logger.log(
          'Circuit breaker: Moving to CLOSED state (service recovered)',
        );
      }
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // If we fail in HALF_OPEN, immediately go back to OPEN
      this.state = CircuitState.OPEN;
      this.successCount = 0;
      ErrorLogger.logWarning(
        this.logger,
        'Circuit breaker: Moving back to OPEN state (service still failing)',
        {
          state: CircuitState.OPEN,
          previousState: CircuitState.HALF_OPEN,
        },
      );
    } else if (this.failureCount >= this.config.failureThreshold) {
      // If we exceed threshold, open circuit
      this.state = CircuitState.OPEN;
      ErrorLogger.logError(
        this.logger,
        'Circuit breaker: Moving to OPEN state',
        new Error('Failure threshold exceeded'),
        {
          state: CircuitState.OPEN,
          failureCount: this.failureCount,
          failureThreshold: this.config.failureThreshold,
        },
      );
    }
  }

  /**
   * Get current circuit state
   */
  public getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  public getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Manually reset circuit breaker (for testing/admin)
   */
  public reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.logger.log('Circuit breaker: Manually reset to CLOSED state');
  }

  /**
   * Determines if an error is transient (should trigger circuit breaker)
   * Transient errors: connection issues, timeouts, network problems
   * Permanent errors: validation errors, not found, business logic errors
   *
   * @param error - Error to classify
   * @returns true if error is transient, false otherwise
   */
  private isTransientError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false; // Unknown error type, don't count as transient
    }

    const transientPatterns = [
      /ECONNREFUSED/i, // Connection refused
      /ETIMEDOUT/i, // Timeout
      /ENOTFOUND/i, // DNS not found
      /connection.*refused/i,
      /connection.*timeout/i,
      /connection.*closed/i,
      /network.*error/i,
      /socket.*hang.*up/i,
      /ECONNRESET/i,
      /EPIPE/i,
      /database.*unavailable/i,
      /too many connections/i,
    ];

    return transientPatterns.some((pattern) => pattern.test(error.message));
  }
}
