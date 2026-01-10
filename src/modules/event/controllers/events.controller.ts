import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import 'express'; // Ensure type augmentation is loaded
/// <reference path="../../types/express.d.ts" />
import { Request } from 'express';

import { IErrorLoggerService } from '../../common/services/interfaces/error-logger-service.interface';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../../common/services/interfaces/error-logger-service.token';
import { createRateLimitingConfig } from '../../config/config-factory';
import { RateLimitingConfig } from '../../config/interfaces/rate-limiting-config.interface';
import { CONFIG_TOKENS } from '../../config/tokens/config.tokens';
import { CreateEventDto } from '../dtos/create-event.dto';
import { IngestResponseDto } from '../dtos/ingest-event-response.dto';
import { MetricsDto } from '../dtos/metrics-response.dto';
import { QueryDto } from '../dtos/query-events.dto';
import { SearchResponseDto } from '../dtos/search-events-response.dto';
import { IEventBufferService } from '../services/interfaces/event-buffer-service.interface';
import { EVENT_BUFFER_SERVICE_TOKEN } from '../services/interfaces/event-buffer-service.token';
import { IEventService } from '../services/interfaces/event-service.interface';
import { EVENT_SERVICE_TOKEN } from '../services/interfaces/event-service.token';
import {
  ApiGetMetrics,
  ApiIngestEvent,
  ApiQueryEvents,
} from './decorators/swagger.decorators';

// Get rate limiting config for decorators (static values needed at compile time)
const rateLimitConfig = createRateLimitingConfig();

@ApiTags('Events')
@Controller()
export class EventController {
  private readonly logger = new Logger(EventController.name);

  constructor(
    @Inject(EVENT_SERVICE_TOKEN)
    private readonly eventService: IEventService,
    @Inject(EVENT_BUFFER_SERVICE_TOKEN)
    private readonly eventBufferService: IEventBufferService,
    @Inject(ERROR_LOGGER_SERVICE_TOKEN)
    private readonly errorLogger: IErrorLoggerService,
    @Inject(CONFIG_TOKENS.RATE_LIMITING)
    private readonly rateLimitConfig: RateLimitingConfig,
  ) {}

  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({
    default: { limit: rateLimitConfig.globalLimit, ttl: rateLimitConfig.ttlMs },
  })
  @ApiIngestEvent()
  /**
   * Ingest a new event
   * Validates event, enriches with metadata, and enqueues to buffer
   * Returns immediately with event ID (non-blocking)
   *
   * @param createEventDto - Event data to ingest
   * @returns Object with status, event_id, and queued_at timestamp
   * @throws HttpException 429 if buffer is full (backpressure)
   * @throws HttpException 503 if system is under pressure
   *
   * Note: Validation is handled by class-validator via ValidationPipe
   * If validation fails, NestJS automatically returns 400 Bad Request
   * This handler only runs if validation passes
   */
  async ingestEvent(
    @Body() createEventDto: CreateEventDto,
    @Req() req: Request,
  ): Promise<IngestResponseDto> {
    try {
      return await this.eventService.ingest(createEventDto);
    } catch (error) {
      // If it's already an HttpException (including our custom exceptions), re-throw it
      if (error instanceof HttpException) {
        // Specific log for backpressure
        if (error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
          this.errorLogger.logWarning(
            this.logger,
            'Buffer is full, rejecting event (backpressure)',
            {
              service: createEventDto.service,
              correlationId: req.correlationId || 'unknown',
            },
          );
        }
        throw error;
      }
      // Log unexpected error and convert to HttpException
      this.errorLogger.logError(
        this.logger,
        'Unexpected error ingesting event',
        error,
        this.errorLogger.createContext(undefined, createEventDto.service, {
          correlationId: req.correlationId || 'unknown',
        }),
      );
      throw new HttpException(
        {
          status: 'error',
          message: 'Failed to ingest event',
          errorCode: 'INGESTION_ERROR',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('events')
  @Throttle({
    default: { limit: rateLimitConfig.queryLimit, ttl: rateLimitConfig.ttlMs },
  })
  @ApiQueryEvents()
  /**
   * Search and query events by service and time range
   * Supports pagination and sorting
   *
   * @param queryDto - Query parameters (service, from, to, page, pageSize, sortField, sortOrder)
   * @returns SearchResponseDto with paginated results
   * @throws HttpException 400 if timestamp format is invalid or time range is invalid
   * @throws HttpException 500 if internal error occurs
   */
  async queryEvents(
    @Query() queryDto: QueryDto,
    @Req() req: Request,
  ): Promise<SearchResponseDto> {
    try {
      return await this.eventService.search(queryDto);
    } catch (error: unknown) {
      // Check for timestamp or time range validation errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage?.includes('timestamp') ||
        errorMessage?.includes('time range') ||
        errorMessage?.includes('Time range')
      ) {
        throw new HttpException(
          {
            status: 'error',
            message: errorMessage || 'Invalid timestamp or time range',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      this.errorLogger.logError(
        this.logger,
        'Query error',
        error,
        this.errorLogger.createContext(undefined, queryDto.service, {
          from: queryDto.from,
          to: queryDto.to,
          correlationId: req.correlationId || 'unknown',
        }),
      );
      throw new HttpException(
        {
          status: 'error',
          message: 'Internal server error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('metrics')
  @ApiGetMetrics()
  /**
   * Get buffer metrics and system health status
   *
   * @returns MetricsDto containing buffer metrics (size, capacity, utilization, etc.)
   * @throws HttpException 500 if internal error occurs
   */
  getMetrics(): MetricsDto {
    try {
      return this.eventBufferService.getMetrics();
    } catch (error) {
      // If it's already an HttpException, re-throw it
      if (error instanceof HttpException) {
        throw error;
      }
      // Log unexpected error and convert to HttpException
      this.errorLogger.logError(
        this.logger,
        'Unexpected error getting metrics',
        error,
      );
      throw new HttpException(
        {
          status: 'error',
          message: 'Failed to retrieve metrics',
          errorCode: 'METRICS_ERROR',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
