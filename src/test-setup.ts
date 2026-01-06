// Global test setup to silence expected error logs during tests
// This prevents noise from expected error scenarios in tests

// Store original console methods
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

// Track if we're in a test environment
const isTestEnvironment =
  process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

// Helper to check if a message matches expected error patterns
function isExpectedError(message: string): boolean {
  const expectedErrorPatterns = [
    'Retention cleanup failed',
    'Circuit breaker: Moving to OPEN state',
    'Failed to save metrics',
    'Error processing batch',
    'Batch processing error',
    'Failure threshold exceeded',
    'Failed to save checkpoint',
    "Cannot read properties of undefined (reading 'write')",
  ];

  return expectedErrorPatterns.some((pattern) => message.includes(pattern));
}

// Helper to check if a message matches expected warning patterns
function isExpectedWarning(message: string): boolean {
  const expectedWarningPatterns = [
    'Failed to insert events',
    'Failed to re-enqueue event for retry',
    'Retry summary',
  ];

  return expectedWarningPatterns.some((pattern) => message.includes(pattern));
}

// Helper to check if a log line from NestJS matches expected patterns
function isExpectedNestJSLog(line: string): boolean {
  // NestJS format: [Nest] PID - timestamp ERROR [ServiceName] Message
  // Check if it contains ERROR or WARN and matches expected patterns
  if (line.includes('ERROR') || line.includes('WARN')) {
    return isExpectedError(line) || isExpectedWarning(line);
  }
  return false;
}

// Silence error and warn logs during tests
if (isTestEnvironment) {
  // Override console.error to filter out expected error logs
  console.error = (...args: any[]) => {
    const message = args[0]?.toString() || '';

    // Only log unexpected errors
    if (!isExpectedError(message)) {
      originalError.apply(console, args);
    }
  };

  // Override console.warn to filter out expected warning logs
  console.warn = (...args: any[]) => {
    const message = args[0]?.toString() || '';

    // Only log unexpected warnings
    if (!isExpectedWarning(message)) {
      originalWarn.apply(console, args);
    }
  };

  // Override console.log to filter out NestJS Logger error/warn logs
  console.log = (...args: any[]) => {
    const message = args[0]?.toString() || '';

    // Check if it's a NestJS log format: [Nest] PID - timestamp LEVEL [ServiceName]
    if (message.includes('[Nest]')) {
      if (isExpectedNestJSLog(message)) {
        return; // Silence expected NestJS logs
      }
    }

    // Try to parse as JSON (NestJS structured logger format)
    try {
      const logEntry = JSON.parse(message);
      const logMessage = logEntry.message || '';
      const logLevel = logEntry.level || '';

      // Filter out expected errors and warnings from structured logs
      if (logLevel === 'error' && isExpectedError(logMessage)) {
        return; // Silence expected error
      }
      if (logLevel === 'warn' && isExpectedWarning(logMessage)) {
        return; // Silence expected warning
      }
    } catch {
      // Not JSON, check if it's a plain error/warn message
      if (isExpectedError(message) || isExpectedWarning(message)) {
        return; // Silence expected messages
      }
    }

    // Log everything else
    originalLog.apply(console, args);
  };
}
