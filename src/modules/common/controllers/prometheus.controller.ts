import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { IErrorLoggerService } from '../services/interfaces/error-logger-service.interface';
import { ERROR_LOGGER_SERVICE_TOKEN } from '../services/interfaces/error-logger-service.token';
import { PrometheusService } from '../services/prometheus.service';

@ApiTags('Metrics')
@Controller()
export class PrometheusController {
  private readonly logger = new Logger(PrometheusController.name);

  constructor(
    private readonly prometheusService: PrometheusService,
    @Inject(ERROR_LOGGER_SERVICE_TOKEN)
    private readonly errorLogger: IErrorLoggerService,
  ) {}

  @Get('metrics/prometheus')
  @ApiOperation({
    summary: 'Get Prometheus metrics',
    description:
      'Returns application metrics in Prometheus format for scraping',
  })
  @ApiResponse({
    status: 200,
    description: 'Prometheus metrics in text format',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
          example:
            '# HELP buffer_size Current buffer size\n# TYPE buffer_size gauge\nbuffer_size 1234',
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  /**
   * Get Prometheus metrics endpoint
   * Returns metrics in Prometheus text format for scraping
   *
   * @returns Prometheus metrics as plain text
   * @throws HttpException 500 if metrics cannot be retrieved
   */
  async getPrometheusMetrics(@Res() res: Response): Promise<void> {
    try {
      const metrics = await this.prometheusService.getMetrics();
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(metrics);
    } catch (error) {
      this.errorLogger.logError(
        this.logger,
        'Error retrieving Prometheus metrics',
        error,
      );
      throw new HttpException(
        {
          status: 'error',
          message: 'Failed to retrieve metrics',
          errorCode: 'METRICS_ERROR',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
