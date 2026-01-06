import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from '../common/common.module';
import { EventHealthController } from './controllers/event-health.controller';
import { EventController } from './controllers/events.controller';
import { Event } from './entities/event.entity';
import { EVENT_REPOSITORY_TOKEN } from './repositories/event.repository.token';
import { TypeOrmEventRepository } from './repositories/typeorm-event.repository';
import { BusinessMetricsService } from './services/business-metrics.service';
import { EventBufferService } from './services/event-buffer.service';
import { EventService } from './services/events.service';
import { MetricsPersistenceService } from './services/metrics-persistence.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event]),
    CommonModule, // No longer needs forwardRef - no circular dependency
  ],
  controllers: [EventController, EventHealthController],
  providers: [
    EventService,
    EventBufferService,
    MetricsPersistenceService,
    BusinessMetricsService,
    TypeOrmEventRepository,
    {
      provide: EVENT_REPOSITORY_TOKEN,
      useClass: TypeOrmEventRepository,
    },
  ],
  exports: [EventBufferService, EventService],
})
export class EventModule {}
