/**
 * Token for dependency injection of IEventService
 * Used to decouple services from concrete EventService implementation
 *
 * This token is necessary because TypeScript interfaces don't exist at runtime,
 * so NestJS needs a string token to identify the dependency.
 */
export const EVENT_SERVICE_TOKEN = 'IEventService';
