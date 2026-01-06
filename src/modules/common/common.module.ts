import { Module } from '@nestjs/common';

import { CircuitBreakerService } from './services/circuit-breaker.service';
import { ErrorHandlingService } from './services/error-handling.service';
import { HealthService } from './services/health.service';

@Module({
  providers: [HealthService, ErrorHandlingService, CircuitBreakerService],
  exports: [HealthService, CircuitBreakerService],
})
export class CommonModule {}
