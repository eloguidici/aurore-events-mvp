/**
 * Token for dependency injection of IBusinessMetricsRepository
 * Used to decouple BusinessMetricsService from concrete repository implementation
 *
 * This token is necessary because TypeScript interfaces don't exist at runtime,
 * so NestJS needs a string token to identify the dependency.
 */
export const BUSINESS_METRICS_REPOSITORY_TOKEN = 'IBusinessMetricsRepository';

