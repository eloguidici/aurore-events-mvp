import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EventsService } from '../services/events.service';
import { EventBufferService } from '../services/event-buffer.service';
import { CreateEventDto } from '../dtos/create-event.dto';
import { QueryEventsDto } from '../dtos/query-events.dto';
import { SearchEventsResponseDto, EventResponseDto } from '../dtos/search-events-response.dto';
import { IngestEventResponseDto } from '../dtos/ingest-event-response.dto';
import { MetricsResponseDto } from '../dtos/metrics-response.dto';
import { ApiIngestEvent, ApiQueryEvents, ApiGetMetrics } from './decorators/swagger.decorators';
import { ErrorLogger } from '../../common/utils/error-logger';

@ApiTags('Events')
@Controller()
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly eventBufferService: EventBufferService,
  ) {}

  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 300000, ttl: 60000 } }) // 300,000 requests per minute = 5,000 events/second
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
  async ingestEvent(@Body() createEventDto: CreateEventDto): Promise<IngestEventResponseDto> {
    try {
      return this.eventsService.ingestEvent(createEventDto);
    } catch (error) {
      // If it's already an HttpException (including our custom exceptions), re-throw it
      if (error instanceof HttpException) {
        // Specific log for backpressure
        if (error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
          ErrorLogger.logWarning(
            this.logger,
            'Buffer is full, rejecting event (backpressure)',
            { service: createEventDto.service },
          );
        }
        throw error;
      }
      // Log unexpected error and convert to HttpException
      ErrorLogger.logError(
        this.logger,
        'Unexpected error ingesting event',
        error,
        ErrorLogger.createErrorContext(undefined, createEventDto.service),
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
  @Throttle({ default: { limit: 200, ttl: 60000 } }) // 200 requests per minute for queries
  @ApiQueryEvents()
  /**
   * Search and query events by service and time range
   * Supports pagination and sorting
   * 
   * @param queryDto - Query parameters (service, from, to, page, pageSize, sortField, sortOrder)
   * @returns SearchEventsResponseDto with paginated results
   * @throws HttpException 400 if timestamp format is invalid or time range is invalid
   * @throws HttpException 500 if internal error occurs
   */
  async queryEvents(@Query() queryDto: QueryEventsDto): Promise<SearchEventsResponseDto> {
    try {
      return await this.eventsService.queryEvents(queryDto);
    } catch (error) {
      if (error.message.includes('timestamp')) {
        throw new HttpException(
          {
            status: 'error',
            message: error.message,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      ErrorLogger.logError(
        this.logger,
        'Query error',
        error,
        ErrorLogger.createErrorContext(undefined, queryDto.service, {
          from: queryDto.from,
          to: queryDto.to,
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
   * @returns MetricsResponseDto containing buffer metrics (size, capacity, utilization, etc.)
   * @throws HttpException 500 if internal error occurs
   */
  getHealth(): MetricsResponseDto {
    try {
      return this.eventBufferService.getMetrics();
    } catch (error) {
      // If it's already an HttpException, re-throw it
      if (error instanceof HttpException) {
        throw error;
      }
      // Log unexpected error and convert to HttpException
      ErrorLogger.logError(
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

