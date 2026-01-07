/**
 * Type augmentation for Express Request
 * Adds correlationId property to Request interface
 * 
 * This file must be included in tsconfig.json and imported/referenced
 * in files that use correlationId on Request objects.
 */
/// <reference types="express" />

declare namespace Express {
  interface Request {
    /**
     * Correlation ID for request tracking
     * Set by CorrelationIdMiddleware
     * Can be provided via X-Correlation-Id header or auto-generated
     */
    correlationId?: string;
  }
}

// Also augment express-serve-static-core for compatibility
declare module 'express-serve-static-core' {
  interface Request {
    correlationId?: string;
  }
}
