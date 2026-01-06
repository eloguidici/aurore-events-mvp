import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { envs } from '../../config/envs';
import { EventsService } from '../../event/services/events.service';
import { ErrorLogger } from '../../common/utils/error-logger';

@Injectable()
export class RetentionService implements OnModuleInit {
  private readonly logger = new Logger(RetentionService.name);
  private readonly retentionDays: number;
  private readonly cronSchedule: string;

  constructor(
    private readonly eventsService: EventsService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    this.retentionDays = envs.retentionDays;
    this.cronSchedule = envs.retentionCronSchedule;
  }

  /**
   * Register cron job dynamically on module initialization
   * This allows using the schedule from environment variables instead of hardcoded value
   */
  onModuleInit() {
    const job = new CronJob(this.cronSchedule, () => {
      this.handleCleanup();
    });

    this.schedulerRegistry.addCronJob('retention-cleanup', job);
    job.start();

    this.logger.log(
      `Retention cleanup job scheduled with cron: ${this.cronSchedule}`,
    );
  }

  /**
   * Daily cleanup job - runs at configured schedule
   * Schedule is required via environment variable (validated at startup)
   */
  async handleCleanup() {
    this.logger.log(
      `Starting retention cleanup (deleting events older than ${this.retentionDays} days)`,
    );

    try {
      const deletedCount = await this.eventsService.deleteOldEvents(
        this.retentionDays,
      );

      this.logger.log(
        `Retention cleanup completed: ${deletedCount} events deleted`,
      );
    } catch (error) {
      ErrorLogger.logError(
        this.logger,
        'Retention cleanup failed',
        error,
        { retentionDays: this.retentionDays },
      );
      // Continue - next day's run will catch remaining old events
    }
  }

  /**
   * Manual cleanup trigger (for testing or manual runs)
   * 
   * @returns Number of events deleted
   * @throws Error if cleanup fails
   */
  async cleanupNow(): Promise<number> {
    this.logger.log('Manual cleanup triggered');
    try {
      const deletedCount = await this.eventsService.deleteOldEvents(
        this.retentionDays,
      );
      this.logger.log(
        `Manual cleanup completed: ${deletedCount} events deleted`,
      );
      return deletedCount;
    } catch (error) {
      ErrorLogger.logError(
        this.logger,
        'Manual cleanup failed',
        error,
        { retentionDays: this.retentionDays },
      );
      throw error;
    }
  }
}

