import { INestApplication } from '@nestjs/common';

/**
 * Configures global application settings
 * Enables CORS for internal services
 *
 * @param app - NestJS application instance
 */
export function configureApp(app: INestApplication): void {
  // Enable CORS for internal services
  app.enableCors();
}
