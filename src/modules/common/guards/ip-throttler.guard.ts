import 'express'; // Import to ensure type augmentation is loaded

import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Custom throttler guard that uses IP address for rate limiting
 * Extends the default ThrottlerGuard to track requests per IP instead of globally
 */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  /**
   * Get tracker (identifier) for rate limiting
   * Override to use IP address instead of a global counter
   *
   * @param req - Request object
   * @returns IP address as tracker string
   */
  protected async getTracker(req: Request): Promise<string> {
    // Use IP address for tracking instead of a global counter
    // This enables per-IP rate limiting
    const ip =
      req.ip ||
      (req as Request & { connection?: { remoteAddress?: string } })
        .connection?.remoteAddress ||
      (req as Request & { socket?: { remoteAddress?: string } })
        .socket?.remoteAddress ||
      'unknown';
    return ip;
  }

  /**
   * Generate key for rate limiting storage
   * Combines IP address with route path for granular control
   *
   * @param context - Execution context
   * @param suffix - Suffix (tracker + limit)
   * @param name - Throttler name
   * @returns Storage key
   */
  protected generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    const request = context.switchToHttp().getRequest<Request>();
    // Get route path from request URL or use default
    const route =
      (request as Request & { route?: { path?: string } }).route?.path ||
      request.url ||
      'default';

    // Combine IP, route, and throttler name for per-IP, per-route rate limiting
    return `throttle:${name}:${suffix}:${route}`;
  }
}
