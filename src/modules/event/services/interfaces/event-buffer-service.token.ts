/**
 * Token for dependency injection of IEventBufferService
 * Used to decouple services from concrete EventBufferService implementation
 *
 * This token is necessary because TypeScript interfaces don't exist at runtime,
 * so NestJS needs a string token to identify the dependency.
 */
export const EVENT_BUFFER_SERVICE_TOKEN = 'IEventBufferService';
