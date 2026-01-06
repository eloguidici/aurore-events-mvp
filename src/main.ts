import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import {
  configureApplication,
  startApplication,
} from './config/bootstrap.config';
import { envs } from './modules/config/envs';

/**
 * Bootstrap function - Application entry point
 * Creates NestJS application, configures it, and starts the server
 * Handles errors gracefully and exits on failure
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    // Create the NestJS application instance
    const app = await NestFactory.create(AppModule);

    // Configure global pipes, middleware, and documentation
    configureApplication(app);

    // Start the application server
    await startApplication(app);
  } catch (error) {
    logger.error('Failed to start application', error.stack);
    process.exit(1);
  }
}

bootstrap();
