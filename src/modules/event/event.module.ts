import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from '../common/common.module';
import { DeadLetterQueueController } from './controllers/dead-letter-queue.controller';
import { EventHealthController } from './controllers/event-health.controller';
import { EventController } from './controllers/events.controller';
import { DeadLetterEvent } from './entities/dead-letter-event.entity';
import { Event } from './entities/event.entity';
import { FileMetricsRepository } from './repositories/file-metrics.repository';
import { BUSINESS_METRICS_REPOSITORY_TOKEN } from './repositories/interfaces/business-metrics.repository.token';
import { EVENT_REPOSITORY_TOKEN } from './repositories/interfaces/event.repository.token';
import { METRICS_REPOSITORY_TOKEN } from './repositories/interfaces/metrics.repository.token';
import { TypeOrmBusinessMetricsRepository } from './repositories/typeorm-business-metrics.repository';
import { TypeOrmEventRepository } from './repositories/typeorm-event.repository';
import { BusinessMetricsService } from './services/business-metrics.service';
import { DeadLetterQueueService } from './services/dead-letter-queue.service';
import { EventBufferService } from './services/event-buffer.service';
import { EventService } from './services/events.service';
import { DEAD_LETTER_QUEUE_SERVICE_TOKEN } from './services/interfaces/dead-letter-queue-service.token';
import { EVENT_BUFFER_SERVICE_TOKEN } from './services/interfaces/event-buffer-service.token';
import { EVENT_SERVICE_TOKEN } from './services/interfaces/event-service.token';
import { MetricsPersistenceService } from './services/metrics-persistence.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, DeadLetterEvent]),
    forwardRef(() => CommonModule), // Provides MetricsCollectorService and other common services - using forwardRef to resolve circular dependency
  ],
  controllers: [
    EventController,
    EventHealthController,
    DeadLetterQueueController,
  ],
  providers: [
    EventService,
    {
      provide: EVENT_SERVICE_TOKEN,
      useClass: EventService,
    },
    EventBufferService,
    {
      provide: EVENT_BUFFER_SERVICE_TOKEN,
      useClass: EventBufferService,
    },
    DeadLetterQueueService,
    {
      provide: DEAD_LETTER_QUEUE_SERVICE_TOKEN,
      useClass: DeadLetterQueueService,
    },
    MetricsPersistenceService,
    BusinessMetricsService,
    TypeOrmEventRepository,
    TypeOrmBusinessMetricsRepository,
    {
      provide: BUSINESS_METRICS_REPOSITORY_TOKEN,
      useClass: TypeOrmBusinessMetricsRepository,
    },
    {
      provide: EVENT_REPOSITORY_TOKEN,
      useClass: TypeOrmEventRepository,
    },
    FileMetricsRepository,
    {
      provide: METRICS_REPOSITORY_TOKEN,
      useClass: FileMetricsRepository,
    },
  ],
  exports: [
    EventBufferService,
    EVENT_BUFFER_SERVICE_TOKEN,
    EventService,
    EVENT_SERVICE_TOKEN,
    BusinessMetricsService,
    DeadLetterQueueService,
    DEAD_LETTER_QUEUE_SERVICE_TOKEN,
  ],
})
export class EventModule {}
