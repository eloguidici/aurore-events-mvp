/**
 * Token for dependency injection of ICircuitBreakerService
 * Used to decouple services from concrete CircuitBreakerService implementation
 *
 * This token is necessary because TypeScript interfaces don't exist at runtime,
 * so NestJS needs a string token to identify the dependency.
 */
export const CIRCUIT_BREAKER_SERVICE_TOKEN = 'ICircuitBreakerService';

