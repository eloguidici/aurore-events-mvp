import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Inject } from '@nestjs/common';
import { ICircuitBreakerService } from '../../common/services/interfaces/circuit-breaker-service.interface';
import { CIRCUIT_BREAKER_SERVICE_TOKEN } from '../../common/services/interfaces/circuit-breaker-service.token';
import { IHealthService } from '../../common/services/interfaces/health.interface';
import { HEALTH_SERVICE_TOKEN } from '../../common/services/interfaces/health-service.token';
import { CONFIG_TOKENS } from '../../config/tokens/config.tokens';
import { createRateLimitingConfig } from '../../config/config-factory';
import { RateLimitingConfig } from '../../config/interfaces/rate-limiting-config.interface';
import { BusinessMetricsDto } from '../dtos/business-metrics-response.dto';
import { Event } from '../entities/event.entity';
import { BusinessMetricsService } from '../services/business-metrics.service';
import { IEventBufferService } from '../services/interfaces/event-buffer-service.interface';
import { EVENT_BUFFER_SERVICE_TOKEN } from '../services/interfaces/event-buffer-service.token';

// Get rate limiting config for decorators (static values needed at compile time)
const rateLimitConfig = createRateLimitingConfig();

@ApiTags('Event Health')
@Controller('health')
export class EventHealthController {
  constructor(
    @Inject(HEALTH_SERVICE_TOKEN)
    private readonly healthService: IHealthService,
    @Inject(CIRCUIT_BREAKER_SERVICE_TOKEN)
    private readonly circuitBreaker: ICircuitBreakerService,
    @Inject(EVENT_BUFFER_SERVICE_TOKEN)
    private readonly eventBufferService: IEventBufferService,
    private readonly businessMetricsService: BusinessMetricsService,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @Inject(CONFIG_TOKENS.RATE_LIMITING)
    private readonly rateLimitConfig: RateLimitingConfig,
  ) {}

  @Get('database')
  @Throttle({
    default: { limit: rateLimitConfig.healthLimit, ttl: rateLimitConfig.ttlMs },
  })
  @ApiOperation({ summary: 'Check database connectivity and health' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Database is healthy' })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Database is unavailable',
  })
  async checkDatabase() {
    try {
      // Simple query to check database connectivity
      await this.eventRepository.query('SELECT 1');
      const circuitState = this.circuitBreaker.getState();

      return {
        status: 'healthy',
        database: 'connected',
        circuitBreaker: {
          state: circuitState,
          ...this.circuitBreaker.getMetrics(),
        },
      };
    } catch (error: any) {
      // Sanitize error message to prevent information leakage
      const sanitizedError =
        error?.message && typeof error.message === 'string'
          ? 'Database connection failed'
          : 'Unknown database error';

      return {
        status: 'unhealthy',
        database: 'disconnected',
        error: sanitizedError,
        circuitBreaker: {
          state: this.circuitBreaker.getState(),
          ...this.circuitBreaker.getMetrics(),
        },
      };
    }
  }

  @Get('buffer')
  @Throttle({
    default: { limit: rateLimitConfig.healthLimit, ttl: rateLimitConfig.ttlMs },
  })
  @ApiOperation({ summary: 'Check buffer health and metrics' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Buffer metrics retrieved',
  })
  async checkBuffer() {
    const metrics = this.eventBufferService.getMetrics();
    return {
      status: metrics.status,
      buffer: {
        size: metrics.buffer_size,
        capacity: metrics.buffer_capacity,
        utilization_percent: metrics.buffer_utilization_percent,
      },
      metrics: {
        total_enqueued: metrics.metrics.total_enqueued,
        total_dropped: metrics.metrics.total_dropped,
        drop_rate_percent: metrics.metrics.drop_rate_percent,
        throughput_events_per_second:
          metrics.metrics.throughput_events_per_second,
      },
    };
  }

  @Get('detailed')
  @Throttle({
    default: {
      limit: Math.floor(rateLimitConfig.healthLimit / 2),
      ttl: rateLimitConfig.ttlMs,
    },
  })
  @ApiOperation({ summary: 'Get detailed health status of all components' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Detailed health status' })
  async getDetailedHealth() {
    const [databaseHealth, bufferHealth, circuitMetrics, businessMetrics] =
      await Promise.allSettled([
        this.checkDatabase(),
        Promise.resolve(this.checkBuffer()),
        Promise.resolve(this.circuitBreaker.getMetrics()),
        this.businessMetricsService.getBusinessMetrics(),
      ]);

    return {
      timestamp: new Date().toISOString(), // UTC timestamp (ISO 8601, ends with 'Z')
      server: this.healthService.checkHealth(),
      database:
        databaseHealth.status === 'fulfilled'
          ? databaseHealth.value
          : { status: 'error', error: 'Database health check failed' },
      buffer:
        bufferHealth.status === 'fulfilled'
          ? bufferHealth.value
          : { status: 'error', error: 'Buffer health check failed' },
      circuitBreaker:
        circuitMetrics.status === 'fulfilled'
          ? circuitMetrics.value
          : { status: 'error', error: 'Circuit breaker metrics unavailable' },
      business:
        businessMetrics.status === 'fulfilled'
          ? businessMetrics.value
          : { status: 'error', error: 'Business metrics unavailable' },
    };
  }

  @Get('business')
  @Throttle({
    default: {
      limit: Math.floor(rateLimitConfig.healthLimit / 2),
      ttl: rateLimitConfig.ttlMs,
    },
  })
  @ApiOperation({
    summary: 'Get business metrics and insights',
    description: `Retrieves comprehensive business metrics about event patterns, service usage, and trends.

**Metrics Included:**
- **Total Events**: Total number of events in the system
- **Events by Service**: Breakdown of events grouped by service name
- **Events Last 24 Hours**: Number of events ingested in the last 24 hours
- **Events Last Hour**: Number of events ingested in the last hour
- **Average Events per Minute**: Calculated from last 24 hours
- **Top Services**: Top 10 services by event count
- **Events by Hour**: Hourly breakdown of events (last 24 hours)

**Caching:**
Metrics are cached for 1 minute to reduce database load. Use this endpoint for dashboards and analytics.`,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Business metrics retrieved successfully',
    type: BusinessMetricsDto,
  })
  async getBusinessMetrics(): Promise<BusinessMetricsDto> {
    const metrics = await this.businessMetricsService.getBusinessMetrics();
    return new BusinessMetricsDto(metrics);
  }
}
