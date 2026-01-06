import { Module } from '@nestjs/common';

import { CircuitBreakerService } from './services/circuit-breaker.service';
import { ErrorHandlingService } from './services/error-handling.service';
import { HealthService } from './services/health.service';
import { MetricsCollectorService } from './services/metrics-collector.service';

@Module({
  providers: [
    HealthService,
    ErrorHandlingService,
    CircuitBreakerService,
    MetricsCollectorService,
  ],
  exports: [HealthService, CircuitBreakerService, MetricsCollectorService],
})
export class CommonModule {}
