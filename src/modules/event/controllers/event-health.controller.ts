import { Controller, Get, HttpStatus } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ICircuitBreakerService } from '../../common/services/interfaces/circuit-breaker-service.interface';
import { CIRCUIT_BREAKER_SERVICE_TOKEN } from '../../common/services/interfaces/circuit-breaker-service.token';
import { IHealthService } from '../../common/services/interfaces/health.interface';
import { HEALTH_SERVICE_TOKEN } from '../../common/services/interfaces/health-service.token';
import { createRateLimitingConfig } from '../../config/config-factory';
import { RateLimitingConfig } from '../../config/interfaces/rate-limiting-config.interface';
import { CONFIG_TOKENS } from '../../config/tokens/config.tokens';
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
  @ApiOperation({
    summary: 'Check database connectivity and health',
    description:
      'Returns database connection status, query latency, and circuit breaker state',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Database is healthy' })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Database is unavailable',
  })
  async checkDatabase() {
    const startTime = Date.now();

    try {
      // Simple query to check database connectivity and measure latency
      await this.eventRepository.query('SELECT 1');
      const queryLatency = Date.now() - startTime;

      // Get database connection pool info if available
      const connectionCount = await this.getDatabaseConnectionInfo();

      const circuitState = this.circuitBreaker.getState();
      const circuitMetrics = this.circuitBreaker.getMetrics();

      return {
        status: queryLatency > 1000 ? 'warning' : 'healthy',
        database: 'connected',
        queryLatencyMs: queryLatency,
        connectionPool: connectionCount,
        circuitBreaker: {
          state: circuitState,
          ...circuitMetrics,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      const queryLatency = Date.now() - startTime;

      // Sanitize error message to prevent information leakage
      const sanitizedError =
        error?.message && typeof error.message === 'string'
          ? 'Database connection failed'
          : 'Unknown database error';

      return {
        status: 'unhealthy',
        database: 'disconnected',
        error: sanitizedError,
        queryLatencyMs: queryLatency,
        circuitBreaker: {
          state: this.circuitBreaker.getState(),
          ...this.circuitBreaker.getMetrics(),
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get database connection pool information
   * @private
   */
  private async getDatabaseConnectionInfo(): Promise<{
    active: number;
    idle: number;
    waiting: number;
  } | null> {
    try {
      // TypeORM doesn't expose connection pool stats directly, so we use a query
      // This is a best-effort approach - actual pool stats may vary
      const result = await this.eventRepository.query(
        `SELECT count(*) as active_connections FROM pg_stat_activity WHERE datname = current_database() AND state = 'active'`,
      );

      const activeConnections = parseInt(
        result[0]?.active_connections || '0',
        10,
      );

      return {
        active: activeConnections,
        idle: 0, // Not directly available
        waiting: 0, // Not directly available
      };
    } catch (error) {
      // If query fails, return null (not critical for health check)
      return null;
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
  @ApiOperation({
    summary: 'Get detailed health status of all components',
    description:
      'Returns comprehensive health status including database, buffer, circuit breaker, business metrics, memory, and system information',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Detailed health status' })
  async getDetailedHealth() {
    const startTime = Date.now();

    const [
      databaseHealth,
      bufferHealth,
      circuitMetrics,
      businessMetrics,
      memoryInfo,
    ] = await Promise.allSettled([
      this.checkDatabase(),
      Promise.resolve(this.checkBuffer()),
      Promise.resolve(this.circuitBreaker.getMetrics()),
      this.businessMetricsService.getBusinessMetrics(),
      this.checkMemory(),
    ]);

    const responseTime = Date.now() - startTime;

    // Determine overall health status
    const overallStatus = this.determineOverallHealth({
      database:
        databaseHealth.status === 'fulfilled' ? databaseHealth.value : null,
      buffer: bufferHealth.status === 'fulfilled' ? bufferHealth.value : null,
      circuitBreaker:
        circuitMetrics.status === 'fulfilled' ? circuitMetrics.value : null,
    });

    return {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      responseTimeMs: responseTime,
      uptime: process.uptime(),
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
      memory:
        memoryInfo.status === 'fulfilled'
          ? memoryInfo.value
          : { status: 'error' },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
      },
    };
  }

  /**
   * Check memory usage and availability
   * @private
   */
  private async checkMemory() {
    try {
      const usage = process.memoryUsage();
      const totalMemory = usage.heapTotal + usage.external;
      const usedMemory = usage.heapUsed + usage.external;
      const freeMemory = totalMemory - usedMemory;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;

      return {
        status:
          memoryUsagePercent > 90
            ? 'critical'
            : memoryUsagePercent > 75
              ? 'warning'
              : 'healthy',
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
        external: Math.round(usage.external / 1024 / 1024), // MB
        rss: Math.round(usage.rss / 1024 / 1024), // MB
        usagePercent: Math.round(memoryUsagePercent * 100) / 100,
        freeMB: Math.round(freeMemory / 1024 / 1024), // MB
      };
    } catch (error) {
      return { status: 'error', error: 'Failed to get memory information' };
    }
  }

  /**
   * Determine overall health status from component health checks
   * @private
   */
  private determineOverallHealth(checks: {
    database: any;
    buffer: any;
    circuitBreaker: any;
  }): 'healthy' | 'warning' | 'critical' | 'error' {
    const statuses: string[] = [];

    if (checks.database) {
      statuses.push(checks.database.status || 'unknown');
    }
    if (checks.buffer) {
      statuses.push(checks.buffer.status || 'unknown');
    }
    if (checks.circuitBreaker?.state === 'OPEN') {
      statuses.push('critical');
    }

    if (statuses.includes('error') || statuses.includes('critical')) {
      return 'critical';
    }
    if (statuses.includes('unhealthy') || statuses.includes('warning')) {
      return 'warning';
    }
    if (statuses.every((s) => s === 'healthy')) {
      return 'healthy';
    }
    return 'warning';
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
