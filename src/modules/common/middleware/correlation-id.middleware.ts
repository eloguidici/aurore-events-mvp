import 'express'; // Ensure type augmentation is loaded

import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to add correlation ID to requests
 * Correlation IDs help track requests across the system for better observability
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CorrelationIdMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    // Get correlation ID from header or generate a new one
    const headerCorrelationId = req.headers['x-correlation-id'];
    const correlationId =
      (Array.isArray(headerCorrelationId)
        ? headerCorrelationId[0]
        : headerCorrelationId) || uuidv4();

    // Add to request object for use in services
    req.correlationId = correlationId;

    // Add to response header for client tracking
    res.setHeader('X-Correlation-Id', correlationId);

    // Add to logger context (if using structured logging)
    this.logger.debug(`Request with correlation ID: ${correlationId}`, {
      correlationId,
      method: req.method,
      path: req.path,
    });

    next();
  }
}
