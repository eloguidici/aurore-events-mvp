/**
 * Interface for Sanitizer Service
 * Defines the contract for sanitizing user input
 */
export interface ISanitizerService {
  /**
   * Sanitize a string by removing HTML tags and dangerous content
   *
   * @param input - String to sanitize
   * @returns Sanitized string
   */
  sanitizeString(input: string): string;

  /**
   * Sanitize an object recursively with depth and key limits
   * Sanitizes all string values in the object
   *
   * @param obj - Object to sanitize
   * @param depth - Current depth (default: 0)
   * @param keyCount - Current key count (default: 0)
   * @returns Sanitized object
   */
  sanitizeObject(
    obj: any,
    depth?: number,
    keyCount?: number,
  ): any;
}

