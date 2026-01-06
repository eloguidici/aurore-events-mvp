/**
 * Token for dependency injection of IEventRepository
 * Used to decouple EventService from concrete repository implementation
 * 
 * This token is necessary because TypeScript interfaces don't exist at runtime,
 * so NestJS needs a string token to identify the dependency.
 * 
 * This file is kept separate from the module to avoid circular dependencies:
 * - EventModule imports EventService
 * - EventService needs EVENT_REPOSITORY_TOKEN
 * - If token is in EventModule, it creates a circular dependency
 */
export const EVENT_REPOSITORY_TOKEN = 'IEventRepository';

