/**
 * Configuration Module exports
 *
 * Main entry point for configuration module.
 * Exports all configuration interfaces, tokens, and the ConfigModule.
 */

// Module
export { ConfigModule } from './config.module';

// Tokens
export { CONFIG_TOKENS } from './tokens/config.tokens';

// Interfaces
export * from './interfaces';

// Factory functions (for advanced use cases)
export * from './config-factory';

// Legacy exports (for backward compatibility)
export { envs } from './envs';
