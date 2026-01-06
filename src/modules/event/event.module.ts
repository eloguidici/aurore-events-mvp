import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventController } from './controllers/events.controller';
import { EventHealthController } from './controllers/event-health.controller';
import { EventService } from './services/events.service';
import { EventBufferService } from './services/event-buffer.service';
import { MetricsPersistenceService } from './services/metrics-persistence.service';
import { BusinessMetricsService } from './services/business-metrics.service';
import { Event } from './entities/event.entity';
import { TypeOrmEventRepository } from './repositories/typeorm-event.repository';
import { EVENT_REPOSITORY_TOKEN } from './repositories/event.repository.token';
import { CommonModule } from '../common/common.module';

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
