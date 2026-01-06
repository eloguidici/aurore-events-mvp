import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { HealthService } from './health.service';

@Injectable()
export class ErrorHandlingService implements OnModuleInit {
  private readonly logger = new Logger(ErrorHandlingService.name);
  private isInitialized = false;

  constructor(private readonly healthService: HealthService) {}

  onModuleInit() {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;
    this.setupErrorHandlers();
    this.logger.log('Global error handlers registered');
  }

  private setupErrorHandlers() {
    // Handle uncaught exceptions (synchronous errors)
    process.on('uncaughtException', (error: Error) => {
      this.logger.error(
        `Uncaught Exception: ${error.message}`,
        error.stack,
        'UncaughtException',
      );

      // Mark server as not ready
      this.healthService.signalNotReady();

      // Log error details
      this.logger.error('Application will exit due to uncaught exception', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });

      // Graceful shutdown - give time for logs to flush
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    // Handle unhandled promise rejections (asynchronous errors)
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      const errorMessage =
        reason instanceof Error ? reason.message : String(reason);
      const errorStack =
        reason instanceof Error ? reason.stack : undefined;

      this.logger.error(
        `Unhandled Rejection: ${errorMessage}`,
        errorStack,
        'UnhandledRejection',
      );

      // Mark server as not ready if it's a critical error
      // Not all unhandled rejections are fatal, but we log them
      if (this.isCriticalError(reason)) {
        this.healthService.signalNotReady();
        this.logger.warn(
          'Critical unhandled rejection detected, server marked as not ready',
        );
      }

      // Log error details
      this.logger.error('Unhandled promise rejection', {
        reason: errorMessage,
        stack: errorStack,
        promise: promise.toString(),
      });
    });

    // Handle warnings (optional, but useful for debugging)
    process.on('warning', (warning: Error) => {
      this.logger.warn(`Node.js Warning: ${warning.name}`, warning.stack);
    });
  }

  /**
   * Determines if an error is critical enough to mark server as not ready
   * Override this method to customize critical error detection
   */
  private isCriticalError(reason: any): boolean {
    // Database connection errors, memory errors, etc. are critical
    if (reason instanceof Error) {
      const criticalPatterns = [
        /ECONNREFUSED/i,
        /ETIMEDOUT/i,
        /ENOTFOUND/i,
        /out of memory/i,
        /cannot read property/i,
        /typeerror/i,
      ];

      return criticalPatterns.some((pattern) =>
        pattern.test(reason.message),
      );
    }

    return false;
  }
}

