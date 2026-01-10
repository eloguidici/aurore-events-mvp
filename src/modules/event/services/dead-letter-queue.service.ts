import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IErrorLoggerService } from '../../common/services/interfaces/error-logger-service.interface';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../../common/services/interfaces/error-logger-service.token';
import { DeadLetterEvent } from '../entities/dead-letter-event.entity';
import { IDeadLetterQueueService } from './interfaces/dead-letter-queue-service.interface';
import { EnrichedEvent } from './interfaces/enriched-event.interface';
import { IEventBufferService } from './interfaces/event-buffer-service.interface';
import { EVENT_BUFFER_SERVICE_TOKEN } from './interfaces/event-buffer-service.token';

/**
 * Dead Letter Queue service
 * Manages events that permanently failed after all retry attempts
 */
@Injectable()
export class DeadLetterQueueService implements IDeadLetterQueueService {
  private readonly logger = new Logger(DeadLetterQueueService.name);

  constructor(
    @InjectRepository(DeadLetterEvent)
    private readonly dlqRepository: Repository<DeadLetterEvent>,
    @Inject(EVENT_BUFFER_SERVICE_TOKEN)
    private readonly eventBufferService: IEventBufferService,
    @Inject(ERROR_LOGGER_SERVICE_TOKEN)
    private readonly errorLogger: IErrorLoggerService,
  ) {}

  /**
   * Add event to Dead Letter Queue after all retries failed
   */
  async addToDLQ(
    event: EnrichedEvent,
    failureReason: string,
    retryCount: number,
  ): Promise<void> {
    try {
      // Check if event already exists in DLQ (by eventId)
      const existing = await this.dlqRepository.findOne({
        where: { eventId: event.eventId },
      });

      if (existing) {
        this.logger.warn(
          `Event ${event.eventId} already exists in DLQ, updating instead of creating duplicate`,
        );
        // Update existing entry
        existing.failureReason = failureReason;
        existing.retryCount = retryCount;
        existing.lastAttemptAt = new Date();
        await this.dlqRepository.save(existing);
        return;
      }

      // Create new DLQ entry
      const dlqEvent = this.dlqRepository.create({
        eventId: event.eventId,
        originalEvent: event as any, // Store full event as JSONB
        failureReason,
        retryCount,
        lastAttemptAt: new Date(),
        reprocessed: false,
        service: event.service || null,
        originalTimestamp: event.timestamp ? new Date(event.timestamp) : null,
      });

      await this.dlqRepository.save(dlqEvent);

      this.logger.warn(
        `Event ${event.eventId} added to Dead Letter Queue after ${retryCount} retry attempts. Reason: ${failureReason}`,
      );
    } catch (error) {
      // Log error but don't throw - DLQ failure shouldn't break the system
      this.errorLogger.logError(
        this.logger,
        'Failed to add event to Dead Letter Queue',
        error,
        {
          eventId: event.eventId,
          service: event.service,
          failureReason,
          retryCount,
        },
      );
    }
  }

  /**
   * List events in Dead Letter Queue
   */
  async listDLQEvents(options?: {
    service?: string;
    reprocessed?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{
    events: Array<{
      id: string;
      eventId: string;
      service: string | null;
      failureReason: string;
      retryCount: number;
      lastAttemptAt: Date;
      reprocessed: boolean;
      createdAt: Date;
    }>;
    total: number;
  }> {
    try {
      const limit = options?.limit || 100;
      const offset = options?.offset || 0;

      const queryBuilder = this.dlqRepository.createQueryBuilder('dlq');

      // Apply filters
      if (options?.service) {
        queryBuilder.andWhere('dlq.service = :service', {
          service: options.service,
        });
      }

      if (options?.reprocessed !== undefined) {
        queryBuilder.andWhere('dlq.reprocessed = :reprocessed', {
          reprocessed: options.reprocessed,
        });
      }

      // Execute queries in parallel
      const [events, total] = await Promise.all([
        queryBuilder
          .orderBy('dlq.createdAt', 'DESC')
          .limit(limit)
          .offset(offset)
          .getMany(),
        queryBuilder.getCount(),
      ]);

      return {
        events: events.map((e) => ({
          id: e.id,
          eventId: e.eventId,
          service: e.service,
          failureReason: e.failureReason,
          retryCount: e.retryCount,
          lastAttemptAt: e.lastAttemptAt,
          reprocessed: e.reprocessed,
          createdAt: e.createdAt,
        })),
        total,
      };
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to list DLQ events',
        error,
        options,
      );
      return { events: [], total: 0 };
    }
  }

  /**
   * Get a specific dead letter event by ID
   */
  async getDLQEventById(id: string): Promise<{
    id: string;
    eventId: string;
    originalEvent: EnrichedEvent;
    failureReason: string;
    retryCount: number;
    lastAttemptAt: Date;
    reprocessed: boolean;
    createdAt: Date;
  } | null> {
    try {
      const dlqEvent = await this.dlqRepository.findOne({
        where: { id },
      });

      if (!dlqEvent) {
        return null;
      }

      return {
        id: dlqEvent.id,
        eventId: dlqEvent.eventId,
        originalEvent: dlqEvent.originalEvent as EnrichedEvent,
        failureReason: dlqEvent.failureReason,
        retryCount: dlqEvent.retryCount,
        lastAttemptAt: dlqEvent.lastAttemptAt,
        reprocessed: dlqEvent.reprocessed,
        createdAt: dlqEvent.createdAt,
      };
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to get DLQ event by ID',
        error,
        { id },
      );
      return null;
    }
  }

  /**
   * Reprocess a dead letter event (re-enqueue to buffer)
   */
  async reprocessEvent(id: string): Promise<boolean> {
    try {
      const dlqEvent = await this.dlqRepository.findOne({
        where: { id },
      });

      if (!dlqEvent) {
        throw new NotFoundException(`Dead letter event not found: ${id}`);
      }

      if (dlqEvent.reprocessed) {
        this.logger.warn(
          `Event ${dlqEvent.eventId} has already been reprocessed`,
        );
        return false;
      }

      // Re-enqueue original event to buffer
      const originalEvent = dlqEvent.originalEvent as EnrichedEvent;
      const enqueued = this.eventBufferService.enqueue(originalEvent);

      if (enqueued) {
        // Mark as reprocessed
        dlqEvent.reprocessed = true;
        dlqEvent.reprocessedAt = new Date();
        await this.dlqRepository.save(dlqEvent);

        this.logger.log(
          `Event ${dlqEvent.eventId} reprocessed and re-enqueued to buffer`,
        );
        return true;
      } else {
        this.logger.warn(
          `Failed to re-enqueue event ${dlqEvent.eventId}: buffer is full`,
        );
        return false;
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.errorLogger.logError(
        this.logger,
        'Failed to reprocess DLQ event',
        error,
        { id },
      );
      return false;
    }
  }

  /**
   * Delete a dead letter event permanently
   */
  async deleteDLQEvent(id: string): Promise<void> {
    try {
      const dlqEvent = await this.dlqRepository.findOne({
        where: { id },
      });

      if (!dlqEvent) {
        throw new NotFoundException(`Dead letter event not found: ${id}`);
      }

      await this.dlqRepository.remove(dlqEvent);

      this.logger.log(`Dead letter event ${id} deleted permanently`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.errorLogger.logError(
        this.logger,
        'Failed to delete DLQ event',
        error,
        { id },
      );
      throw error;
    }
  }

  /**
   * Get statistics about Dead Letter Queue
   */
  async getDLQStatistics(): Promise<{
    total: number;
    byService: Record<string, number>;
    reprocessed: number;
    pending: number;
    oldestEvent: Date | null;
  }> {
    try {
      const [total, reprocessed, pending, allEvents] = await Promise.all([
        this.dlqRepository.count(),
        this.dlqRepository.count({ where: { reprocessed: true } }),
        this.dlqRepository.count({ where: { reprocessed: false } }),
        this.dlqRepository.find({
          select: ['service', 'createdAt'],
          order: { createdAt: 'ASC' },
          take: 1, // Only need oldest event
        }),
      ]);

      // Get counts by service
      const serviceCounts = await this.dlqRepository
        .createQueryBuilder('dlq')
        .select('dlq.service', 'service')
        .addSelect('COUNT(*)', 'count')
        .groupBy('dlq.service')
        .getRawMany();

      const byService: Record<string, number> = {};
      serviceCounts.forEach((row) => {
        if (row.service) {
          byService[row.service] = parseInt(row.count, 10);
        }
      });

      return {
        total,
        byService,
        reprocessed,
        pending,
        oldestEvent: allEvents.length > 0 ? allEvents[0].createdAt : null,
      };
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to get DLQ statistics',
        error,
      );
      return {
        total: 0,
        byService: {},
        reprocessed: 0,
        pending: 0,
        oldestEvent: null,
      };
    }
  }
}
