/**
 * Type augmentation for Express Request
 * Adds correlationId property to Request interface
 */
declare module 'express-serve-static-core' {
  interface Request {
    /**
     * Correlation ID for request tracking
     * Set by CorrelationIdMiddleware
     */
    correlationId?: string;
  }
}
