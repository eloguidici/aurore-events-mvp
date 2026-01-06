import { v4 as uuidv4 } from 'uuid';

/**
 * Tracing context for distributed tracing
 * Stores correlation ID and trace information
 */
export interface TracingContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  correlationId?: string;
  serviceName: string;
  startTime: number;
}

/**
 * Utility for distributed tracing
 * Provides basic tracing functionality (can be extended with OpenTelemetry later)
 */
export class Tracing {
  /**
   * Create a new tracing context
   * 
   * @param serviceName - Name of the service creating the trace
   * @param correlationId - Optional correlation ID from request
   * @param parentSpanId - Optional parent span ID for nested traces
   * @returns New tracing context
   */
  static createContext(
    serviceName: string,
    correlationId?: string,
    parentSpanId?: string,
  ): TracingContext {
    return {
      traceId: uuidv4(),
      spanId: uuidv4(),
      parentSpanId,
      correlationId,
      serviceName,
      startTime: Date.now(),
    };
  }

  /**
   * Create a child span from parent context
   * 
   * @param parentContext - Parent tracing context
   * @param serviceName - Name of the child service/operation
   * @returns Child tracing context
   */
  static createChildContext(
    parentContext: TracingContext,
    serviceName: string,
  ): TracingContext {
    return {
      traceId: parentContext.traceId, // Same trace ID
      spanId: uuidv4(), // New span ID
      parentSpanId: parentContext.spanId,
      correlationId: parentContext.correlationId,
      serviceName,
      startTime: Date.now(),
    };
  }

  /**
   * Get duration in milliseconds
   * 
   * @param context - Tracing context
   * @returns Duration in milliseconds
   */
  static getDuration(context: TracingContext): number {
    return Date.now() - context.startTime;
  }

  /**
   * Format trace for logging
   * 
   * @param context - Tracing context
   * @returns Formatted trace string
   */
  static formatTrace(context: TracingContext): string {
    return `[traceId=${context.traceId}, spanId=${context.spanId}, service=${context.serviceName}]`;
  }
}

