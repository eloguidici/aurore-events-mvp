/**
 * Token for dependency injection of IHealthService
 * Used to decouple services from concrete HealthService implementation
 *
 * This token is necessary because TypeScript interfaces don't exist at runtime,
 * so NestJS needs a string token to identify the dependency.
 */
export const HEALTH_SERVICE_TOKEN = 'IHealthService';
