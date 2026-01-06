import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { ErrorLogger } from '../../common/utils/error-logger';
import { envs } from '../../config/envs';
import { EventService } from '../../event/services/events.service';
import { IRetentionService } from '../interfaces/retention-service.interface';

@Injectable()
export class RetentionService implements IRetentionService, OnModuleInit {
  private readonly logger = new Logger(RetentionService.name);
  private readonly retentionDays: number;
  private readonly cronSchedule: string;

  constructor(
    private readonly eventService: EventService,
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
      this.cleanup();
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
  public async cleanup() {
    this.logger.log(
      `Starting retention cleanup (deleting events older than ${this.retentionDays} days)`,
    );

    try {
      const deletedCount = await this.eventService.cleanup(this.retentionDays);

      this.logger.log(
        `Retention cleanup completed: ${deletedCount} events deleted`,
      );
    } catch (error) {
      ErrorLogger.logError(this.logger, 'Retention cleanup failed', error, {
        retentionDays: this.retentionDays,
      });
      // Continue - next day's run will catch remaining old events
    }
  }

  /**
   * Manual cleanup trigger (for testing or manual runs)
   *
   * @returns Number of events deleted
   * @throws Error if cleanup fails
   */
  public async cleanupNow(): Promise<number> {
    this.logger.log('Manual cleanup triggered');
    try {
      const deletedCount = await this.eventService.cleanup(this.retentionDays);
      this.logger.log(
        `Manual cleanup completed: ${deletedCount} events deleted`,
      );
      return deletedCount;
    } catch (error) {
      ErrorLogger.logError(this.logger, 'Manual cleanup failed', error, {
        retentionDays: this.retentionDays,
      });
      throw error;
    }
  }
}
