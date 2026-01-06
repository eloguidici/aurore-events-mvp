import { Injectable, Logger } from '@nestjs/common';
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
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private readonly config: CircuitBreakerConfig;

  constructor() {
    // Configurable via envs in production
    this.config = {
      failureThreshold: 5, // Open circuit after 5 failures
      successThreshold: 2, // Close circuit after 2 successes in HALF_OPEN
      timeout: 30000, // Wait 30 seconds before trying HALF_OPEN
    };
  }

  /**
   * Execute operation with circuit breaker protection
   * 
   * @param operation - Async operation to execute
   * @returns Result of operation
   * @throws Error if circuit is open or operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has passed to try HALF_OPEN
      if (this.lastFailureTime && Date.now() - this.lastFailureTime >= this.config.timeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        this.logger.log('Circuit breaker: Moving to HALF_OPEN state');
      } else {
        throw new Error('Circuit breaker is OPEN - database operations temporarily unavailable');
      }
    }

    try {
      // Execute operation
      const result = await operation();

      // On success
      this.onSuccess();
      return result;
    } catch (error) {
      // On failure
      this.onFailure();
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
        this.logger.log('Circuit breaker: Moving to CLOSED state (service recovered)');
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
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics() {
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
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.logger.log('Circuit breaker: Manually reset to CLOSED state');
  }
}

