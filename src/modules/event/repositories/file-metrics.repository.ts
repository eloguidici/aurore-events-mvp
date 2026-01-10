import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

import { IErrorLoggerService } from '../../common/services/interfaces/error-logger-service.interface';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../../common/services/interfaces/error-logger-service.token';
import {
  IMetricsRepository,
  MetricsSnapshot,
} from './interfaces/metrics.repository.interface';

/**
 * File-based implementation of MetricsRepository
 * Persists metrics snapshots to a JSONL file (one JSON object per line)
 * Uses JSONL format for efficient appending and reading
 */
@Injectable()
export class FileMetricsRepository implements IMetricsRepository {
  private readonly logger = new Logger(FileMetricsRepository.name);
  private readonly metricsDir: string;
  private readonly metricsFile: string;

  constructor(
    @Inject(ERROR_LOGGER_SERVICE_TOKEN)
    private readonly errorLogger: IErrorLoggerService,
  ) {
    this.metricsDir = path.join(process.cwd(), 'metrics');
    this.metricsFile = path.join(this.metricsDir, 'metrics-history.jsonl');
  }

  /**
   * Initialize repository
   * Creates metrics directory if it doesn't exist
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.metricsDir, { recursive: true });
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to create metrics directory',
        error,
        { metricsDir: this.metricsDir },
      );
      throw error;
    }
  }

  /**
   * Save a metrics snapshot to file
   * Appends snapshot as a JSON line to the JSONL file
   *
   * @param snapshot - Metrics snapshot to save
   * @returns Promise that resolves when snapshot is saved
   */
  async save(snapshot: MetricsSnapshot): Promise<void> {
    try {
      // Append to JSONL file (one JSON object per line)
      const line = JSON.stringify(snapshot) + '\n';
      await fs.appendFile(this.metricsFile, line, 'utf-8');
      this.logger.debug('Metrics snapshot saved to file');
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Failed to save metrics snapshot',
        error,
        {
          metricsFile: this.metricsFile,
        },
      );
      throw error;
    }
  }

  /**
   * Get metrics history from file (last N entries)
   * Reads JSONL file and returns the last N snapshots
   *
   * @param limit - Maximum number of entries to return
   * @returns Array of metrics snapshots
   */
  async getHistory(limit: number): Promise<MetricsSnapshot[]> {
    try {
      const content = await fs.readFile(this.metricsFile, 'utf-8');
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.trim());
      const snapshots = lines
        .slice(-limit)
        .map((line) => JSON.parse(line) as MetricsSnapshot);
      return snapshots;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist yet - return empty array
        return [];
      }
      this.errorLogger.logError(
        this.logger,
        'Failed to read metrics history',
        error,
        {
          metricsFile: this.metricsFile,
          limit,
        },
      );
      return [];
    }
  }
}
