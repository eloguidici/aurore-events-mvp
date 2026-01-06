import { Module } from '@nestjs/common';
import { ErrorHandlingService } from './services/error-handling.service';
import { HealthService } from './services/health.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';

@Module({
  providers: [
    HealthService,
    ErrorHandlingService,
    CircuitBreakerService,
  ],
  exports: [HealthService, CircuitBreakerService],
})
export class CommonModule {}
