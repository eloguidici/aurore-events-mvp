/**
 * Type augmentation for Express Request and Response
 * Adds custom properties for NestJS/Express integration
 *
 * This file extends Express types to add custom properties.
 * Standard Express properties (headers, method, path, ip, url, etc.) should
 * already be available from @types/express package.
 */
import 'express';

// Augment express-serve-static-core module (which Express uses internally)
declare module 'express-serve-static-core' {
  interface Request {
    /**
     * Correlation ID for request tracking
     * Set by CorrelationIdMiddleware
     * Can be provided via X-Correlation-Id header or auto-generated
     */
    correlationId?: string;
  }

  interface Response {
    /**
     * Set HTTP response header
     * Standard Express method - explicitly declared for TypeScript
     */
    setHeader(name: string, value: string | number | string[]): Response;
    
    /**
     * Set HTTP response header (alias for setHeader)
     */
    set(name: string, value: string | number | string[]): Response;
    
    /**
     * Send HTTP response
     */
    send(body?: any): Response;
  }

  interface NextFunction {
    (err?: any): void;
  }
}

// Also augment Express namespace for compatibility
declare namespace Express {
  interface Request {
    /**
     * Correlation ID for request tracking
     * Set by CorrelationIdMiddleware
     * Can be provided via X-Correlation-Id header or auto-generated
     */
    correlationId?: string;
  }

  interface Response {
    /**
     * Set HTTP response header
     */
    setHeader(name: string, value: string | number | string[]): Response;
    set(name: string, value: string | number | string[]): Response;
    send(body?: any): Response;
  }

  interface NextFunction {
    (err?: any): void;
  }
}
