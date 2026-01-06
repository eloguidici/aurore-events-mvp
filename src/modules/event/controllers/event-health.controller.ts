import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { HealthService } from '../../common/services/health.service';
import { CircuitBreakerService } from '../../common/services/circuit-breaker.service';
import { EventBufferService } from '../services/event-buffer.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../entities/event.entity';

@ApiTags('Event Health')
@Controller('health')
export class EventHealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly eventBufferService: EventBufferService,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {}

  @Get('database')
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 requests per minute
  @ApiOperation({ summary: 'Check database connectivity and health' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Database is healthy' })
  @ApiResponse({ status: HttpStatus.SERVICE_UNAVAILABLE, description: 'Database is unavailable' })
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
    } catch (error) {
      return {
        status: 'unhealthy',
        database: 'disconnected',
        error: error.message,
        circuitBreaker: {
          state: this.circuitBreaker.getState(),
          ...this.circuitBreaker.getMetrics(),
        },
      };
    }
  }

  @Get('buffer')
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 requests per minute
  @ApiOperation({ summary: 'Check buffer health and metrics' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Buffer metrics retrieved' })
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
        throughput_events_per_second: metrics.metrics.throughput_events_per_second,
      },
    };
  }

  @Get('detailed')
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 requests per minute
  @ApiOperation({ summary: 'Get detailed health status of all components' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Detailed health status' })
  async getDetailedHealth() {
    const [databaseHealth, bufferHealth, circuitMetrics] = await Promise.allSettled([
      this.checkDatabase(),
      Promise.resolve(this.checkBuffer()),
      Promise.resolve(this.circuitBreaker.getMetrics()),
    ]);

    return {
      timestamp: new Date().toISOString(),
      server: this.healthService.checkHealth(),
      database: databaseHealth.status === 'fulfilled' ? databaseHealth.value : { status: 'error', error: databaseHealth.reason },
      buffer: bufferHealth.status === 'fulfilled' ? bufferHealth.value : { status: 'error', error: bufferHealth.reason },
      circuitBreaker: circuitMetrics.status === 'fulfilled' ? circuitMetrics.value : { status: 'error', error: circuitMetrics.reason },
    };
  }
}

