import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';

import { MESSAGES } from '../constants/constants';
import { IHealthService } from '../interfaces/health.interface';

@Injectable()
export class HealthService implements IHealthService, OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private isReady = false;
  private isShuttingDown = false;

  constructor() {
    this.logger.log('Health service initialized');
  }

  /**
   * Cleanup on module destruction
   * Marks server as shutting down
   */
  onModuleDestroy() {
    this.isShuttingDown = true;
    this.logger.log('Health service shutdown');
  }

  /**
   * Signal that the server is ready to receive traffic
   * Called after all modules are initialized and server is listening
   */
  public signalReady() {
    this.isReady = true;
    this.logger.log('Server signaled as ready');
  }

  /**
   * Signal that the server is not ready
   * Used to indicate server should not receive traffic
   */
  public signalNotReady() {
    this.isReady = false;
    this.logger.warn('Server signaled as not ready');
  }

  /**
   * Register shutdown handler for graceful shutdown
   * Handles SIGTERM and SIGINT signals
   *
   * @param handler - Function to call on shutdown
   */
  public registerShutdownHandler(handler: () => void) {
    // Simple shutdown handler registration
    process.on('SIGTERM', () => {
      this.isShuttingDown = true;
      handler();
    });
    process.on('SIGINT', () => {
      this.isShuttingDown = true;
      handler();
    });
  }

  /**
   * Check if server is ready to receive traffic
   *
   * @returns true if server is ready, false otherwise
   */
  public isServerReady(): boolean {
    return this.isReady;
  }

  /**
   * Check if server is in the process of shutting down
   *
   * @returns true if server is shutting down, false otherwise
   */
  public isServerShuttingDown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Manually trigger shutdown state
   * Marks server as shutting down and not ready
   */
  public shutdown(): void {
    this.isShuttingDown = true;
    this.isReady = false;
  }

  /**
   * Check overall health status
   * Returns status based on readiness and shutdown state
   *
   * @returns Object with HTTP status and message
   */
  public checkHealth() {
    if (this.isServerReady()) {
      return { status: HttpStatus.OK, message: MESSAGES.SERVER_IS_READY };
    } else if (this.isServerShuttingDown()) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: MESSAGES.SERVER_IS_SHUTTING_DOWN,
      };
    } else {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: MESSAGES.SERVER_IS_NOT_READY,
      };
    }
  }

  /**
   * Check liveness status
   * Verifies if server is running and not shutting down
   *
   * @returns Object with HTTP status and message
   */
  public checkLiveness() {
    if (!this.isServerShuttingDown()) {
      return {
        status: HttpStatus.OK,
        message: MESSAGES.SERVER_IS_NOT_SHUTTING_DOWN,
      };
    } else {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: MESSAGES.SERVER_IS_SHUTTING_DOWN,
      };
    }
  }

  /**
   * Check readiness status
   * Determines if server is fully prepared to handle requests
   *
   * @returns Object with HTTP status and message
   */
  public checkReadiness() {
    if (this.isServerReady()) {
      return { status: HttpStatus.OK, message: MESSAGES.SERVER_IS_READY };
    } else {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: MESSAGES.SERVER_IS_NOT_READY,
      };
    }
  }
}
