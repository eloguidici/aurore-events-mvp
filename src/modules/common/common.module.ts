import { forwardRef, Module } from '@nestjs/common';

import { EventModule } from '../event/event.module';
import { PrometheusController } from './controllers/prometheus.controller';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { CompressionService } from './services/compression.service';
import { ErrorHandlingService } from './services/error-handling.service';
import { ErrorLoggerService } from './services/error-logger.service';
import { HealthService } from './services/health.service';
import { CIRCUIT_BREAKER_SERVICE_TOKEN } from './services/interfaces/circuit-breaker-service.token';
import { COMPRESSION_SERVICE_TOKEN } from './services/interfaces/compression-service.token';
import { ERROR_LOGGER_SERVICE_TOKEN } from './services/interfaces/error-logger-service.token';
import { HEALTH_SERVICE_TOKEN } from './services/interfaces/health-service.token';
import { METRICS_COLLECTOR_SERVICE_TOKEN } from './services/interfaces/metrics-collector-service.token';
import { SANITIZER_SERVICE_TOKEN } from './services/interfaces/sanitizer-service.token';
import { MetricsCollectorService } from './services/metrics-collector.service';
import { PrometheusService } from './services/prometheus.service';
import { SanitizerService } from './services/sanitizer.service';

@Module({
  imports: [forwardRef(() => EventModule)], // Required for BusinessMetricsService - using forwardRef to resolve circular dependency
  controllers: [PrometheusController],
  providers: [
    HealthService,
    {
      provide: HEALTH_SERVICE_TOKEN,
      useClass: HealthService,
    },
    ErrorHandlingService,
    CircuitBreakerService,
    {
      provide: CIRCUIT_BREAKER_SERVICE_TOKEN,
      useClass: CircuitBreakerService,
    },
    MetricsCollectorService,
    {
      provide: METRICS_COLLECTOR_SERVICE_TOKEN,
      useClass: MetricsCollectorService,
    },
    ErrorLoggerService,
    {
      provide: ERROR_LOGGER_SERVICE_TOKEN,
      useClass: ErrorLoggerService,
    },
    SanitizerService,
    {
      provide: SANITIZER_SERVICE_TOKEN,
      useClass: SanitizerService,
    },
    CompressionService,
    {
      provide: COMPRESSION_SERVICE_TOKEN,
      useClass: CompressionService,
    },
    PrometheusService,
  ],
  exports: [
    HealthService,
    HEALTH_SERVICE_TOKEN,
    CircuitBreakerService,
    CIRCUIT_BREAKER_SERVICE_TOKEN,
    MetricsCollectorService,
    METRICS_COLLECTOR_SERVICE_TOKEN,
    ErrorLoggerService,
    ERROR_LOGGER_SERVICE_TOKEN,
    SanitizerService,
    SANITIZER_SERVICE_TOKEN,
    CompressionService,
    COMPRESSION_SERVICE_TOKEN,
    PrometheusService,
  ],
})
export class CommonModule {}
