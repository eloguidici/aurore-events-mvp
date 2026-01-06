import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsController } from './controllers/events.controller';
import { EventHealthController } from './controllers/event-health.controller';
import { EventsService } from './services/events.service';
import { EventBufferService } from './services/event-buffer.service';
import { MetricsPersistenceService } from './services/metrics-persistence.service';
import { Event } from './entities/event.entity';
import { TypeOrmEventRepository } from './repositories/typeorm-event.repository';
import { EVENT_REPOSITORY_TOKEN } from './repositories/event.repository.token';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event]),
    CommonModule, // No longer needs forwardRef - no circular dependency
  ],
  controllers: [EventsController, EventHealthController],
  providers: [
    EventsService,
    EventBufferService,
    MetricsPersistenceService,
    TypeOrmEventRepository,
    {
      provide: EVENT_REPOSITORY_TOKEN,
      useClass: TypeOrmEventRepository,
    },
  ],
  exports: [EventBufferService, EventsService],
})
export class EventModule {}

