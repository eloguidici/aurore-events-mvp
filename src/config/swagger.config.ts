import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Configures and sets up Swagger documentation for the application
 * Sets up OpenAPI documentation at /api endpoint
 *
 * @param app - NestJS application instance
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Aurore Events API')
    .setDescription('Event System MVP for Aurore Labs - API Documentation')
    .setVersion('1.0.0')
    .addTag('Events', 'Event ingestion and querying endpoints')
    .addTag('Health Check', 'Health check and metrics endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
