import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { IErrorLoggerService } from '../../common/services/interfaces/error-logger-service.interface';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../../common/services/interfaces/error-logger-service.token';
import { RetentionConfig } from '../../config/interfaces/retention-config.interface';
import { CONFIG_TOKENS } from '../../config/tokens/config.tokens';
import { IEventService } from '../../event/services/interfaces/event-service.interface';
import { EVENT_SERVICE_TOKEN } from '../../event/services/interfaces/event-service.token';
import { IRetentionService } from './interfaces/retention-service.interface';

@Injectable()
export class RetentionService implements IRetentionService, OnModuleInit {
  private readonly logger = new Logger(RetentionService.name);
  private readonly retentionDays: number;
  private readonly cronSchedule: string;

  constructor(
    @Inject(EVENT_SERVICE_TOKEN)
    private readonly eventService: IEventService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(ERROR_LOGGER_SERVICE_TOKEN)
    private readonly errorLogger: IErrorLoggerService,
    @Inject(CONFIG_TOKENS.RETENTION)
    retentionConfig: RetentionConfig,
  ) {
    // Configuration injected via ConfigModule
    this.retentionDays = retentionConfig.days;
    this.cronSchedule = retentionConfig.cronSchedule;
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
      this.errorLogger.logError(
        this.logger,
        'Retention cleanup failed',
        error,
        {
          retentionDays: this.retentionDays,
        },
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
  public async cleanupNow(): Promise<number> {
    this.logger.log('Manual cleanup triggered');
    try {
      const deletedCount = await this.eventService.cleanup(this.retentionDays);
      this.logger.log(
        `Manual cleanup completed: ${deletedCount} events deleted`,
      );
      return deletedCount;
    } catch (error) {
      this.errorLogger.logError(this.logger, 'Manual cleanup failed', error, {
        retentionDays: this.retentionDays,
      });
      throw error;
    }
  }
}
