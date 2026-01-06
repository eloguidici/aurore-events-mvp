import { Module } from '@nestjs/common';
import { RetentionService } from './services/retention.service';
import { EventModule } from '../event/event.module';

/**
 * Retention Module
 *
 * Handles automatic cleanup of old events based on retention policy.
 * Runs scheduled cleanup jobs to delete events older than the configured
 * retention period, helping maintain database size and performance.
 *
 * This module automatically starts when the application initializes and
 * schedules cleanup jobs based on the configured cron schedule.
 */
@Module({
  imports: [EventModule],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
