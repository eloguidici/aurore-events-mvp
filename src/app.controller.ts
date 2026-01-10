import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import {
  ApiHealthCheck,
  ApiLivenessCheck,
  ApiReadinessCheck,
} from './app.controller.decorators';
import { HealthService } from './modules/common/services/health.service';
import { IErrorLoggerService } from './modules/common/services/interfaces/error-logger-service.interface';
import { ERROR_LOGGER_SERVICE_TOKEN } from './modules/common/services/interfaces/error-logger-service.token';

@ApiTags('Health Check')
@Controller()
@Injectable()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly healthService: HealthService,
    @Inject(ERROR_LOGGER_SERVICE_TOKEN)
    private readonly errorLogger: IErrorLoggerService,
  ) {}

  /**
   * Endpoint to check the overall health status of the server.
   * This includes checks for server readiness.
   * @returns An object with a health status message.
   * @throws HttpException if the server is not ready, with status 503.
   */
  @Get('/health')
  @ApiHealthCheck()
  healthCheck() {
    try {
      const { status, message } = this.healthService.checkHealth();
      if (status !== HttpStatus.OK) {
        throw new HttpException(message, status);
      }
      return { message };
    } catch (error) {
      // If it's already an HttpException, re-throw it
      if (error instanceof HttpException) {
        throw error;
      }
      // Log unexpected error and convert to HttpException
      this.errorLogger.logError(
        this.logger,
        'Unexpected error in health check',
        error,
      );
      throw new HttpException(
        {
          status: 'error',
          message: 'Health check failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Endpoint to check the liveness of the server.
   * This verifies if the server is running and not in the process of shutting down.
   * @returns An object with a liveness status message.
   * @throws HttpException if the server is shutting down, with status 503.
   */
  @Get('/live')
  @ApiLivenessCheck()
  livenessCheck() {
    try {
      const { status, message } = this.healthService.checkLiveness();
      if (status !== HttpStatus.OK) {
        throw new HttpException(message, status);
      }
      return { message };
    } catch (error) {
      // If it's already an HttpException, re-throw it
      if (error instanceof HttpException) {
        throw error;
      }
      // Log unexpected error and convert to HttpException
      this.errorLogger.logError(
        this.logger,
        'Unexpected error in liveness check',
        error,
      );
      throw new HttpException(
        {
          status: 'error',
          message: 'Liveness check failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Endpoint to check the readiness of the server.
   * This determines if the server is fully prepared to handle requests.
   * @returns An object with a readiness status message.
   * @throws HttpException if the server is not ready, with status 503.
   */
  @Get('/ready')
  @ApiReadinessCheck()
  readinessCheck() {
    try {
      const { status, message } = this.healthService.checkReadiness();
      if (status !== HttpStatus.OK) {
        throw new HttpException(message, status);
      }
      return { message };
    } catch (error) {
      // If it's already an HttpException, re-throw it
      if (error instanceof HttpException) {
        throw error;
      }
      // Log unexpected error and convert to HttpException
      this.errorLogger.logError(
        this.logger,
        'Unexpected error in readiness check',
        error,
      );
      throw new HttpException(
        {
          status: 'error',
          message: 'Readiness check failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
