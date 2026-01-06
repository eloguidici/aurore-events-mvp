import { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { envs } from '../modules/config/envs';
import { HealthService } from '../modules/common/services/health.service';
import { createValidationPipe } from './validation.config';
import { setupSwagger } from './swagger.config';
import { configureApp } from './app.config';

/**
 * Configures all global pipes, middleware, and documentation
 * Sets up validation, CORS, and Swagger documentation
 *
 * @param app - NestJS application instance
 */
export function configureApplication(app: INestApplication): void {
  // Global validation pipe
  app.useGlobalPipes(createValidationPipe());

  // Application-level configuration (CORS, etc.)
  configureApp(app);

  // Swagger documentation
  setupSwagger(app);
}

/**
 * Initializes the application and starts the server
 * Triggers OnModuleInit hooks, starts listening, and signals readiness
 *
 * @param app - NestJS application instance
 */
export async function startApplication(app: INestApplication): Promise<void> {
  const logger = new Logger('Bootstrap');

  // Initialize the application (this triggers OnModuleInit hooks)
  // This ensures all services (BatchWorker, Retention, etc.) are initialized
  await app.init();

  // Start listening on the configured port
  await app.listen(envs.port);

  logger.log(`🚀 Event System MVP running on http://${envs.host}:${envs.port}`);

  // Get HealthService and signal that the server is ready
  // This happens after all modules are initialized and the server is listening
  const healthService = app.get(HealthService);
  healthService.signalReady();

  logger.log('✅ Server is ready to receive traffic');
}
