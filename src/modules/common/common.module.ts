import { Module } from '@nestjs/common';

import { CIRCUIT_BREAKER_SERVICE_TOKEN } from './services/interfaces/circuit-breaker-service.token';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { ERROR_LOGGER_SERVICE_TOKEN } from './services/interfaces/error-logger-service.token';
import { ErrorLoggerService } from './services/error-logger.service';
import { ErrorHandlingService } from './services/error-handling.service';
import { HEALTH_SERVICE_TOKEN } from './services/interfaces/health-service.token';
import { HealthService } from './services/health.service';
import { MetricsCollectorService } from './services/metrics-collector.service';
import { SANITIZER_SERVICE_TOKEN } from './services/interfaces/sanitizer-service.token';
import { SanitizerService } from './services/sanitizer.service';

@Module({
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
  ],
  exports: [
    HealthService,
    HEALTH_SERVICE_TOKEN,
    CircuitBreakerService,
    CIRCUIT_BREAKER_SERVICE_TOKEN,
    MetricsCollectorService,
    ErrorLoggerService,
    ERROR_LOGGER_SERVICE_TOKEN,
    SanitizerService,
    SANITIZER_SERVICE_TOKEN,
  ],
})
export class CommonModule {}
