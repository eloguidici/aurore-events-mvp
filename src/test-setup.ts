// Global test setup to silence expected error logs during tests
// This prevents noise from expected error scenarios in tests

// Store original console methods
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

// Track if we're in a test environment
const isTestEnvironment =
  process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

// Set default environment variables for tests if not already set
if (isTestEnvironment) {
  // Set required environment variables with test defaults if not already set
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test';
  if (!process.env.PORT) process.env.PORT = '3000';
  if (!process.env.HOST) process.env.HOST = 'localhost';
  if (!process.env.DB_HOST) process.env.DB_HOST = 'localhost';
  if (!process.env.DB_PORT) process.env.DB_PORT = '5432';
  if (!process.env.DB_USERNAME) process.env.DB_USERNAME = 'admin';
  if (!process.env.DB_PASSWORD) process.env.DB_PASSWORD = 'admin';
  if (!process.env.DB_DATABASE) process.env.DB_DATABASE = 'aurore_events_test';
  if (!process.env.DB_SYNCHRONIZE) process.env.DB_SYNCHRONIZE = 'false';
  if (!process.env.DB_LOGGING) process.env.DB_LOGGING = 'false';
  if (!process.env.BATCH_SIZE) process.env.BATCH_SIZE = '5000';
  if (!process.env.DRAIN_INTERVAL) process.env.DRAIN_INTERVAL = '1000';
  if (!process.env.MAX_RETRIES) process.env.MAX_RETRIES = '3';
  if (!process.env.BATCH_MAX_SIZE) process.env.BATCH_MAX_SIZE = '10000';
  if (!process.env.BUFFER_MAX_SIZE) process.env.BUFFER_MAX_SIZE = '50000';
  if (!process.env.RETENTION_DAYS) process.env.RETENTION_DAYS = '30';
  if (!process.env.RETENTION_CRON_SCHEDULE) process.env.RETENTION_CRON_SCHEDULE = '0 2 * * *';
  if (!process.env.DEFAULT_QUERY_LIMIT) process.env.DEFAULT_QUERY_LIMIT = '100';
  if (!process.env.MAX_QUERY_LIMIT) process.env.MAX_QUERY_LIMIT = '1000';
  if (!process.env.MAX_QUERY_TIME_RANGE_DAYS) process.env.MAX_QUERY_TIME_RANGE_DAYS = '30';
  if (!process.env.QUERY_TIMEOUT_MS) process.env.QUERY_TIMEOUT_MS = '30000';
  if (!process.env.MAX_QUERY_PAGE) process.env.MAX_QUERY_PAGE = '10000';
  if (!process.env.SERVICE_NAME_MAX_LENGTH) process.env.SERVICE_NAME_MAX_LENGTH = '100';
  if (!process.env.RETRY_AFTER_SECONDS) process.env.RETRY_AFTER_SECONDS = '5';
  if (!process.env.MESSAGE_MAX_LENGTH) process.env.MESSAGE_MAX_LENGTH = '2000';
  if (!process.env.METADATA_MAX_SIZE_KB) process.env.METADATA_MAX_SIZE_KB = '16';
  if (!process.env.BATCH_CHUNK_SIZE) process.env.BATCH_CHUNK_SIZE = '1000';
  if (!process.env.METADATA_MAX_KEYS) process.env.METADATA_MAX_KEYS = '100';
  if (!process.env.METADATA_MAX_DEPTH) process.env.METADATA_MAX_DEPTH = '5';
  if (!process.env.CHECKPOINT_INTERVAL_MS) process.env.CHECKPOINT_INTERVAL_MS = '5000';
  if (!process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD) process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = '5';
  if (!process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD) process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD = '2';
  if (!process.env.CIRCUIT_BREAKER_TIMEOUT_MS) process.env.CIRCUIT_BREAKER_TIMEOUT_MS = '30000';
  if (!process.env.SHUTDOWN_TIMEOUT_MS) process.env.SHUTDOWN_TIMEOUT_MS = '30000';
  if (!process.env.METRICS_HISTORY_DEFAULT_LIMIT) process.env.METRICS_HISTORY_DEFAULT_LIMIT = '100';
  if (!process.env.THROTTLE_TTL_MS) process.env.THROTTLE_TTL_MS = '60000';
  if (!process.env.THROTTLE_GLOBAL_LIMIT) process.env.THROTTLE_GLOBAL_LIMIT = '300000';
  if (!process.env.THROTTLE_IP_LIMIT) process.env.THROTTLE_IP_LIMIT = '10000';
  if (!process.env.THROTTLE_QUERY_LIMIT) process.env.THROTTLE_QUERY_LIMIT = '200';
  if (!process.env.THROTTLE_HEALTH_LIMIT) process.env.THROTTLE_HEALTH_LIMIT = '60';
  if (!process.env.DB_POOL_MAX) process.env.DB_POOL_MAX = '20';
}

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
