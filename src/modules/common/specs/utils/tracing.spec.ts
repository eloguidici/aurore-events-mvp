import { Tracing, TracingContext } from '../../utils/tracing';

describe('Tracing', () => {
  describe('createContext', () => {
    it('should create a new tracing context', () => {
      const context = Tracing.createContext('test-service');

      expect(context).toHaveProperty('traceId');
      expect(context).toHaveProperty('spanId');
      expect(context).toHaveProperty('serviceName', 'test-service');
      expect(context).toHaveProperty('startTime');
      expect(context.parentSpanId).toBeUndefined();
      expect(context.correlationId).toBeUndefined();
    });

    it('should generate unique traceId and spanId', () => {
      const context1 = Tracing.createContext('service1');
      const context2 = Tracing.createContext('service2');

      expect(context1.traceId).not.toBe(context2.traceId);
      expect(context1.spanId).not.toBe(context2.spanId);
    });

    it('should include correlationId when provided', () => {
      const correlationId = 'correlation-123';
      const context = Tracing.createContext('test-service', correlationId);

      expect(context.correlationId).toBe(correlationId);
    });

    it('should include parentSpanId when provided', () => {
      const parentSpanId = 'parent-span-123';
      const context = Tracing.createContext(
        'test-service',
        undefined,
        parentSpanId,
      );

      expect(context.parentSpanId).toBe(parentSpanId);
    });

    it('should set startTime to current timestamp', () => {
      const beforeTime = Date.now();
      const context = Tracing.createContext('test-service');
      const afterTime = Date.now();

      expect(context.startTime).toBeGreaterThanOrEqual(beforeTime);
      expect(context.startTime).toBeLessThanOrEqual(afterTime);
    });

    it('should generate valid UUID format for traceId', () => {
      const context = Tracing.createContext('test-service');

      expect(context.traceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should generate valid UUID format for spanId', () => {
      const context = Tracing.createContext('test-service');

      expect(context.spanId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('createChildContext', () => {
    it('should create a child context from parent', () => {
      const parentContext = Tracing.createContext('parent-service');
      const childContext = Tracing.createChildContext(
        parentContext,
        'child-service',
      );

      expect(childContext.traceId).toBe(parentContext.traceId);
      expect(childContext.spanId).not.toBe(parentContext.spanId);
      expect(childContext.parentSpanId).toBe(parentContext.spanId);
      expect(childContext.serviceName).toBe('child-service');
      expect(childContext.correlationId).toBe(parentContext.correlationId);
    });

    it('should preserve correlationId from parent', () => {
      const correlationId = 'correlation-123';
      const parentContext = Tracing.createContext(
        'parent-service',
        correlationId,
      );
      const childContext = Tracing.createChildContext(
        parentContext,
        'child-service',
      );

      expect(childContext.correlationId).toBe(correlationId);
    });

    it('should create unique spanId for child', () => {
      const parentContext = Tracing.createContext('parent-service');
      const childContext = Tracing.createChildContext(
        parentContext,
        'child-service',
      );

      expect(childContext.spanId).not.toBe(parentContext.spanId);
    });

    it(
      'should set child startTime to current timestamp',
      () => {
        const parentContext = Tracing.createContext('parent-service');

        // Wait a bit to ensure time difference
        return new Promise((resolve) => {
          setTimeout(() => {
            const beforeTime = Date.now();
            const childContext = Tracing.createChildContext(
              parentContext,
              'child-service',
            );
            const afterTime = Date.now();

            expect(childContext.startTime).toBeGreaterThanOrEqual(beforeTime);
            expect(childContext.startTime).toBeLessThanOrEqual(afterTime);
            expect(childContext.startTime).toBeGreaterThan(
              parentContext.startTime,
            );
            resolve(undefined);
          }, 10);
        });
      },
      10000, // 10 second timeout
    );

    it('should allow nested child contexts', () => {
      const parentContext = Tracing.createContext('parent-service');
      const childContext = Tracing.createChildContext(
        parentContext,
        'child-service',
      );
      const grandchildContext = Tracing.createChildContext(
        childContext,
        'grandchild-service',
      );

      expect(grandchildContext.traceId).toBe(parentContext.traceId);
      expect(grandchildContext.parentSpanId).toBe(childContext.spanId);
      expect(grandchildContext.serviceName).toBe('grandchild-service');
    });
  });

  describe('getDuration', () => {
    it(
      'should return duration in milliseconds',
      () => {
        const context = Tracing.createContext('test-service');

        // Wait a bit
        const waitTime = 50;
        return new Promise((resolve) => {
          setTimeout(() => {
            const duration = Tracing.getDuration(context);
            expect(duration).toBeGreaterThanOrEqual(waitTime - 10); // Allow some margin for timing
            expect(duration).toBeLessThan(waitTime + 100); // Increased upper bound for CI/slow systems
            resolve(undefined);
          }, waitTime);
        });
      },
      10000, // 10 second timeout
    );

    it('should return zero for just created context', () => {
      const context = Tracing.createContext('test-service');
      const duration = Tracing.getDuration(context);

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(10); // Should be very small
    });

    it(
      'should calculate duration correctly for child context',
      () => {
        const parentContext = Tracing.createContext('parent-service');

        // Wait a bit before creating child
        return new Promise((resolve) => {
          setTimeout(() => {
            const childContext = Tracing.createChildContext(
              parentContext,
              'child-service',
            );

            setTimeout(() => {
              const parentDuration = Tracing.getDuration(parentContext);
              const childDuration = Tracing.getDuration(childContext);

              expect(parentDuration).toBeGreaterThan(childDuration);
              resolve(undefined);
            }, 20);
          }, 20);
        });
      },
      10000, // 10 second timeout
    );
  });

  describe('formatTrace', () => {
    it('should format trace context as string', () => {
      const context = Tracing.createContext('test-service');
      const formatted = Tracing.formatTrace(context);

      expect(formatted).toContain('traceId=');
      expect(formatted).toContain('spanId=');
      expect(formatted).toContain('service=test-service');
      expect(formatted).toContain(context.traceId);
      expect(formatted).toContain(context.spanId);
    });

    it('should include all required fields in format', () => {
      const context = Tracing.createContext('test-service');
      const formatted = Tracing.formatTrace(context);

      expect(formatted).toMatch(
        /\[traceId=[^,]+,\s*spanId=[^,]+,\s*service=test-service\]/,
      );
    });

    it('should format child context correctly', () => {
      const parentContext = Tracing.createContext('parent-service');
      const childContext = Tracing.createChildContext(
        parentContext,
        'child-service',
      );
      const formatted = Tracing.formatTrace(childContext);

      expect(formatted).toContain('service=child-service');
      expect(formatted).toContain(childContext.spanId);
      expect(formatted).toContain(childContext.traceId);
    });

    it('should produce consistent format', () => {
      const context1 = Tracing.createContext('service1');
      const context2 = Tracing.createContext('service2');
      const formatted1 = Tracing.formatTrace(context1);
      const formatted2 = Tracing.formatTrace(context2);

      // Should have same structure
      const regex = /\[traceId=[^,]+,\s*spanId=[^,]+,\s*service=[^\]]+\]/;
      expect(formatted1).toMatch(regex);
      expect(formatted2).toMatch(regex);
    });
  });

  describe('TracingContext interface', () => {
    it('should have all required properties', () => {
      const context: TracingContext = Tracing.createContext('test-service');

      expect(context).toHaveProperty('traceId');
      expect(context).toHaveProperty('spanId');
      expect(context).toHaveProperty('serviceName');
      expect(context).toHaveProperty('startTime');
    });

    it('should allow optional properties', () => {
      const context: TracingContext = Tracing.createContext(
        'test-service',
        'correlation-123',
        'parent-123',
      );

      expect(context.parentSpanId).toBe('parent-123');
      expect(context.correlationId).toBe('correlation-123');
    });
  });

  describe('integration', () => {
    it('should work for complete tracing workflow', () => {
      // Create parent trace
      const parentContext = Tracing.createContext(
        'api-service',
        'correlation-123',
      );

      // Simulate some work
      const parentDuration = Tracing.getDuration(parentContext);
      expect(parentDuration).toBeGreaterThanOrEqual(0);

      // Create child trace
      const childContext = Tracing.createChildContext(
        parentContext,
        'db-service',
      );

      // Format both
      const parentFormatted = Tracing.formatTrace(parentContext);
      const childFormatted = Tracing.formatTrace(childContext);

      expect(parentFormatted).toContain('api-service');
      expect(childFormatted).toContain('db-service');
      expect(childContext.traceId).toBe(parentContext.traceId);
      expect(childContext.parentSpanId).toBe(parentContext.spanId);
    });
  });
});
