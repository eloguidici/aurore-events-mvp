import { CircuitState } from '../circuit-breaker.service';

/**
 * Interface for CircuitBreakerService
 * Defines the contract for circuit breaker operations
 */
export interface ICircuitBreakerService {
  /**
   * Execute operation with circuit breaker protection
   *
   * @param operation - Async operation to execute
   * @returns Result of operation
   * @throws Error if circuit is open or operation fails
   */
  execute<T>(operation: () => Promise<T>): Promise<T>;

  /**
   * Get current circuit state
   *
   * @returns Current circuit state (CLOSED, OPEN, or HALF_OPEN)
   */
  getState(): CircuitState;

  /**
   * Get circuit breaker metrics
   *
   * @returns Object containing state, failureCount, successCount, and lastFailureTime
   */
  getMetrics(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number | null;
  };

  /**
   * Manually reset circuit breaker (for testing/admin)
   */
  reset(): void;
}
