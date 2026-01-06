import { Module } from '@nestjs/common';
import { BatchWorkerService } from './services/batch-worker.service';
import { EventModule } from '../event/event.module';

/**
 * Batch Worker Module
 *
 * Handles background processing of events from the buffer.
 * Processes events in batches at configured intervals, validates them,
 * and inserts them into the database with retry logic and exponential backoff.
 *
 * This module automatically starts when the application initializes and
 * stops gracefully when the application shuts down.
 */
@Module({
  imports: [EventModule],
  providers: [BatchWorkerService],
  exports: [BatchWorkerService],
})
export class BatchWorkerModule {}
