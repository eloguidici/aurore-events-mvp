/**
 * Type guard utilities for runtime type validation
 * Provides type-safe checks for common data structures
 */

/**
 * Type guard to check if a value is a non-empty string
 * 
 * @param value - Value to check
 * @returns true if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Type guard to check if a value is a valid date string (ISO 8601 or Unix epoch)
 * 
 * @param value - Value to check
 * @returns true if value is a valid date string
 */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  // Try ISO 8601 format
  const isoDate = new Date(value);
  if (!isNaN(isoDate.getTime())) {
    return true;
  }

  // Try Unix epoch (numeric string)
  const epoch = Number(value);
  if (!isNaN(epoch) && epoch > 0) {
    const epochDate = new Date(epoch * 1000); // Convert to milliseconds
    return !isNaN(epochDate.getTime());
  }

  return false;
}

/**
 * Type guard to check if a value is a plain object (not array, null, or primitive)
 * 
 * @param value - Value to check
 * @returns true if value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

/**
 * Type guard to check if a value is a valid number within a range
 * 
 * @param value - Value to check
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns true if value is a valid number within range
 */
export function isNumberInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    !isNaN(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * Type guard to check if a value is a valid positive integer
 * 
 * @param value - Value to check
 * @returns true if value is a positive integer
 */
export function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0
  );
}

