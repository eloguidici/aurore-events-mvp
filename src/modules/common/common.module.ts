import { Module } from '@nestjs/common';

import { CIRCUIT_BREAKER_SERVICE_TOKEN } from './services/interfaces/circuit-breaker-service.token';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { ERROR_LOGGER_SERVICE_TOKEN } from './services/interfaces/error-logger-service.token';
import { ErrorLoggerService } from './services/error-logger.service';
import { ErrorHandlingService } from './services/error-handling.service';
import { HEALTH_SERVICE_TOKEN } from './services/interfaces/health-service.token';
import { HealthService } from './services/health.service';
import { MetricsCollectorService } from './services/metrics-collector.service';
import { METRICS_COLLECTOR_SERVICE_TOKEN } from './services/interfaces/metrics-collector-service.token';
import { SANITIZER_SERVICE_TOKEN } from './services/interfaces/sanitizer-service.token';
import { SanitizerService } from './services/sanitizer.service';
import { PrometheusController } from './controllers/prometheus.controller';
import { PrometheusService } from './services/prometheus.service';
import { EventModule } from '../event/event.module';

@Module({
  imports: [EventModule], // Required for BusinessMetricsService
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
    PrometheusService,
  ],
})
export class CommonModule {}
