import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from '../common/common.module';
import { EventHealthController } from './controllers/event-health.controller';
import { EventController } from './controllers/events.controller';
import { Event } from './entities/event.entity';
import { EVENT_REPOSITORY_TOKEN } from './repositories/interfaces/event.repository.token';
import { FileMetricsRepository } from './repositories/file-metrics.repository';
import { METRICS_REPOSITORY_TOKEN } from './repositories/interfaces/metrics.repository.token';
import { TypeOrmEventRepository } from './repositories/typeorm-event.repository';
import { BusinessMetricsService } from './services/business-metrics.service';
import { EventBufferService } from './services/event-buffer.service';
import { EVENT_BUFFER_SERVICE_TOKEN } from './services/interfaces/event-buffer-service.token';
import { EventService } from './services/events.service';
import { EVENT_SERVICE_TOKEN } from './services/interfaces/event-service.token';
import { MetricsPersistenceService } from './services/metrics-persistence.service';
import { BUSINESS_METRICS_REPOSITORY_TOKEN } from './repositories/interfaces/business-metrics.repository.token';
import { TypeOrmBusinessMetricsRepository } from './repositories/typeorm-business-metrics.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event]),
    CommonModule, // Provides MetricsCollectorService and other common services
  ],
  controllers: [EventController, EventHealthController],
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
  ],
})
export class EventModule {}
