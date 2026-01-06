import { LoggerService } from '@nestjs/common';

/**
 * Structured logger that outputs JSON for better log analysis
 * Integrates with NestJS LoggerService interface
 */
export class StructuredLogger implements LoggerService {
  private context?: string;

  setContext(context: string) {
    this.context = context;
  }

  log(message: string, context?: string) {
    this.output('log', message, context);
  }

  error(message: string, trace?: string, context?: string) {
    this.output('error', message, context, { trace });
  }

  warn(message: string, context?: string) {
    this.output('warn', message, context);
  }

  debug(message: string, context?: string) {
    this.output('debug', message, context);
  }

  verbose(message: string, context?: string) {
    this.output('verbose', message, context);
  }

  private output(
    level: string,
    message: string,
    context?: string,
    extra?: Record<string, any>,
  ) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: context || this.context || 'Application',
      ...extra,
    };

    // Output as JSON for structured logging
    console.log(JSON.stringify(logEntry));
  }
}
