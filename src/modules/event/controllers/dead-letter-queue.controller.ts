import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { IDeadLetterQueueService } from '../services/interfaces/dead-letter-queue-service.interface';
import { DEAD_LETTER_QUEUE_SERVICE_TOKEN } from '../services/interfaces/dead-letter-queue-service.token';
// import { AdminGuard } from '../../auth/guards/admin.guard'; // Implementar si hay autenticación

const rateLimitConfig = {
  healthLimit: 60,
  ttlMs: 60000,
}; // Temporal hasta que se cargue correctamente

@ApiTags('Dead Letter Queue')
@Controller('dlq')
// @UseGuards(AdminGuard) // Proteger con admin guard
export class DeadLetterQueueController {
  constructor(
    @Inject(DEAD_LETTER_QUEUE_SERVICE_TOKEN)
    private readonly dlqService: IDeadLetterQueueService,
  ) {}

  @Get()
  @Throttle({
    default: { limit: rateLimitConfig.healthLimit, ttl: rateLimitConfig.ttlMs },
  })
  @ApiOperation({
    summary: 'List events in Dead Letter Queue',
    description:
      'Returns paginated list of events that permanently failed after all retry attempts',
  })
  @ApiQuery({
    name: 'service',
    required: false,
    description: 'Filter by service name',
  })
  @ApiQuery({
    name: 'reprocessed',
    required: false,
    description: 'Filter by reprocessed status (true/false)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of events per page (default: 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Offset for pagination (default: 0)',
  })
  @ApiResponse({ status: 200, description: 'List of dead letter events' })
  async listDLQEvents(
    @Query('service') service?: string,
    @Query('reprocessed') reprocessed?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.dlqService.listDLQEvents({
      service,
      reprocessed:
        reprocessed === 'true'
          ? true
          : reprocessed === 'false'
            ? false
            : undefined,
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    return {
      events: result.events,
      total: result.total,
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    };
  }

  @Get('statistics')
  @Throttle({
    default: { limit: rateLimitConfig.healthLimit, ttl: rateLimitConfig.ttlMs },
  })
  @ApiOperation({
    summary: 'Get Dead Letter Queue statistics',
    description:
      'Returns statistics about events in DLQ (total, by service, reprocessed count, etc.)',
  })
  @ApiResponse({ status: 200, description: 'DLQ statistics' })
  async getDLQStatistics() {
    return await this.dlqService.getDLQStatistics();
  }

  @Get(':id')
  @Throttle({
    default: { limit: rateLimitConfig.healthLimit, ttl: rateLimitConfig.ttlMs },
  })
  @ApiOperation({ summary: 'Get dead letter event by ID' })
  @ApiResponse({ status: 200, description: 'Dead letter event details' })
  @ApiResponse({ status: 404, description: 'Dead letter event not found' })
  async getDLQEvent(@Param('id') id: string) {
    const event = await this.dlqService.getDLQEventById(id);
    if (!event) {
      throw new Error(`Dead letter event not found: ${id}`);
    }
    return event;
  }

  @Patch(':id/reprocess')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: rateLimitConfig.healthLimit, ttl: rateLimitConfig.ttlMs },
  })
  @ApiOperation({
    summary: 'Reprocess dead letter event',
    description: 'Re-enqueues event from DLQ to buffer for retry',
  })
  @ApiResponse({ status: 200, description: 'Event reprocessed successfully' })
  @ApiResponse({ status: 404, description: 'Dead letter event not found' })
  @ApiResponse({
    status: 400,
    description: 'Event already reprocessed or buffer full',
  })
  async reprocessEvent(@Param('id') id: string) {
    const success = await this.dlqService.reprocessEvent(id);
    if (!success) {
      throw new Error(
        'Failed to reprocess event (may be already reprocessed or buffer full)',
      );
    }
    return {
      message: 'Event reprocessed successfully',
      eventId: id,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({
    default: { limit: rateLimitConfig.healthLimit, ttl: rateLimitConfig.ttlMs },
  })
  @ApiOperation({
    summary: 'Delete dead letter event permanently',
    description: 'Permanently deletes event from Dead Letter Queue',
  })
  @ApiResponse({ status: 204, description: 'Event deleted successfully' })
  @ApiResponse({ status: 404, description: 'Dead letter event not found' })
  async deleteDLQEvent(@Param('id') id: string): Promise<void> {
    await this.dlqService.deleteDLQEvent(id);
  }
}
