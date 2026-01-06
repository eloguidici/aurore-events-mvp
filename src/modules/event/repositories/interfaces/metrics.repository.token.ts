/**
 * Token for dependency injection of IMetricsRepository
 * Used to decouple MetricsPersistenceService from concrete repository implementation
 *
 * This token is necessary because TypeScript interfaces don't exist at runtime,
 * so NestJS needs a string token to identify the dependency.
 */
export const METRICS_REPOSITORY_TOKEN = 'IMetricsRepository';

