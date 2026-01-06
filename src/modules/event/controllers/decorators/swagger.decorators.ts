import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiBadRequestResponse,
  ApiTooManyRequestsResponse,
  ApiServiceUnavailableResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { CreateEventDto } from '../../dtos/create-event.dto';
import { IngestResponseDto } from '../../dtos/ingest-event-response.dto';
import { SearchResponseDto } from '../../dtos/search-events-response.dto';
import { MetricsDto } from '../../dtos/metrics-response.dto';

/**
 * Swagger decorators for POST /events endpoint
 * Combines all API documentation decorators for event ingestion
 */
export function ApiIngestEvent() {
  return applyDecorators(
    ApiOperation({
      summary: 'Ingest a new event',
      description: `Accepts an event and queues it for asynchronous processing. Returns immediately with event ID if accepted.

**Event Processing Flow:**
1. Event is validated against schema requirements
2. Event is enriched with eventId and ingestedAt timestamp
3. Event is queued in memory buffer for batch processing
4. Response is returned immediately (202 Accepted)

**Backpressure Handling:**
- If buffer is full (BUFFER_SATURATED), returns 429 Too Many Requests with retry_after header
- If system is under pressure (SERVICE_UNAVAILABLE), returns 503 Service Unavailable
- Client should implement exponential backoff when receiving these responses

**Event Validation:**
- timestamp: Must be parseable date (ISO 8601 or Unix epoch)
- service: Required string, max length configured
- message: Required string, max length configured
- metadata: Optional object, max size configured (default: 16KB)`,
    }),
    ApiBody({ type: CreateEventDto }),
    ApiResponse({
      status: HttpStatus.ACCEPTED,
      description: 'Event accepted and queued successfully',
      type: IngestResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'Invalid event schema or validation failed',
      schema: {
        example: {
          status: 'error',
          message: 'Invalid event schema',
          errorCode: 'INVALID_EVENT',
          errors: [
            {
              field: 'timestamp',
              constraints: { isParseableTimestamp: 'timestamp must be a parseable date (ISO 8601 or Unix epoch)' },
            },
          ],
        },
      },
    }),
    ApiTooManyRequestsResponse({
      description: 'Buffer is full, system is under pressure',
      schema: {
        example: {
          status: 'rate_limited',
          message: 'Buffer is full. Please retry in a few seconds.',
          retry_after: 5,
          errorCode: 'BUFFER_SATURATED',
        },
      },
    }),
    ApiServiceUnavailableResponse({
      description: 'System under pressure, unable to accept event',
      schema: {
        example: {
          status: 'service_unavailable',
          message: 'System under pressure. Please retry later.',
        },
      },
    }),
  );
}

/**
 * Swagger decorators for GET /events endpoint
 * Combines all API documentation decorators for event querying
 */
export function ApiQueryEvents() {
  return applyDecorators(
    ApiOperation({
      summary: 'Search events',
      description: `Retrieves events for a specific service within a time range with pagination and sorting support.
      
**Time Range Validation:**
- The 'from' timestamp must be before the 'to' timestamp
- Both timestamps must be valid ISO 8601 format dates
- Invalid time ranges will return a 400 Bad Request error

**Pagination:**
- Use 'page' parameter to navigate through results (starts at 1)
- Use 'pageSize' to control number of results per page (default: 10, max: configured limit)
- Response includes pagination metadata (page, pageSize, total)

**Sorting:**
- Use 'sortField' to specify which field to sort by (allowed: timestamp, service, message, ingestedAt, createdAt)
- Use 'sortOrder' to specify sort direction (ASC or DESC, default: DESC)
- Invalid sort fields will default to 'timestamp'`,
    }),
    ApiQuery({
      name: 'service',
      required: true,
      description: 'Service name to filter events. Must match exactly.',
      example: 'user-service',
      type: String,
    }),
    ApiQuery({
      name: 'from',
      required: true,
      description: 'Start timestamp for the query range in ISO 8601 format (e.g., 2024-01-15T00:00:00Z). Must be before "to" timestamp.',
      example: '2024-01-15T00:00:00Z',
      type: String,
    }),
    ApiQuery({
      name: 'to',
      required: true,
      description: 'End timestamp for the query range in ISO 8601 format (e.g., 2024-01-15T23:59:59Z). Must be after "from" timestamp.',
      example: '2024-01-15T23:59:59Z',
      type: String,
    }),
    ApiQuery({
      name: 'page',
      required: false,
      description: 'Page number for pagination (minimum: 1, default: 1)',
      example: 1,
      type: Number,
    }),
    ApiQuery({
      name: 'pageSize',
      required: false,
      description: 'Number of items per page (minimum: 1, default: 10, maximum: configured limit)',
      example: 10,
      type: Number,
    }),
    ApiQuery({
      name: 'sortField',
      required: false,
      description: 'Field to sort by. Allowed values: timestamp, service, message, ingestedAt, createdAt. Default: timestamp',
      example: 'timestamp',
      enum: ['timestamp', 'service', 'message', 'ingestedAt', 'createdAt'],
    }),
    ApiQuery({
      name: 'sortOrder',
      required: false,
      description: 'Sort order: ASC (ascending) or DESC (descending). Default: DESC',
      example: 'DESC',
      enum: ['ASC', 'DESC'],
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Events retrieved successfully. Response includes pagination metadata and event list.',
      type: SearchResponseDto,
    }),
    ApiBadRequestResponse({
      description: 'Invalid query parameters. Common causes: invalid timestamp format, "from" >= "to", invalid sort field, or invalid pagination values.',
      schema: {
        example: {
          status: 'error',
          message: "'from' timestamp must be before 'to' timestamp",
          errorCode: 'INVALID_TIME_RANGE',
        },
      },
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal server error occurred while processing the query',
      schema: {
        example: {
          status: 'error',
          message: 'Internal server error',
        },
      },
    }),
  );
}

/**
 * Swagger decorators for GET /metrics endpoint
 * Combines all API documentation decorators for buffer metrics
 */
export function ApiGetMetrics() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get buffer metrics',
      description: `Returns comprehensive buffer metrics and system health statistics.

**Metrics Included:**
- **Status**: Health status (healthy/warning/critical) based on utilization and drop rate
- **Buffer Size**: Current number of events in buffer
- **Buffer Capacity**: Maximum buffer capacity
- **Utilization**: Buffer utilization percentage
- **Drop Rate**: Percentage of events dropped due to buffer saturation
- **Throughput**: Average events per second since startup
- **Uptime**: System uptime in seconds
- **Last Operations**: Time since last enqueue/drain operations

**Health Status Logic:**
- **healthy**: Utilization < 70% and drop rate < 1%
- **warning**: Utilization 70-90% or drop rate 1-5%
- **critical**: Utilization >= 90% or drop rate > 5%

Use this endpoint for monitoring system health and capacity planning.`,
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Buffer metrics retrieved successfully. Includes comprehensive statistics and health indicators.',
      type: MetricsDto,
    }),
  );
}

