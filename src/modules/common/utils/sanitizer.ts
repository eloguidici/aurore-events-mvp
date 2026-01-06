import * as sanitizeHtml from 'sanitize-html';

/**
 * Utility for sanitizing user input
 * Removes potentially dangerous HTML/script tags and content
 */
export class Sanitizer {
  private static readonly MAX_DEPTH = 5; // Maximum nesting depth for objects
  private static readonly MAX_KEYS = 100; // Maximum number of keys in an object

  /**
   * Sanitize a string by removing HTML tags and dangerous content
   *
   * @param input - String to sanitize
   * @returns Sanitized string
   */
  static sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') {
      return input;
    }

    // Remove all HTML tags, keep only text content
    return sanitizeHtml(input, {
      allowedTags: [], // No HTML tags allowed
      allowedAttributes: {},
    });
  }

  /**
   * Check if a value is a valid JSON type (string, number, boolean, null, object, array)
   *
   * @param value - Value to check
   * @returns true if value is a valid JSON type
   */
  private static isValidJsonType(value: any): boolean {
    const type = typeof value;
    return (
      type === 'string' ||
      type === 'number' ||
      type === 'boolean' ||
      value === null ||
      (type === 'object' && (Array.isArray(value) || !(value instanceof Date)))
    );
  }

  /**
   * Sanitize an object recursively with depth and key limits
   * Sanitizes all string values in the object
   *
   * @param obj - Object to sanitize
   * @param depth - Current depth (default: 0)
   * @param keyCount - Current key count (default: 0)
   * @returns Sanitized object
   */
  static sanitizeObject(
    obj: any,
    depth: number = 0,
    keyCount: number = 0,
  ): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    // Check depth limit
    if (depth >= this.MAX_DEPTH) {
      return '[Object too deeply nested]';
    }

    // Check key count limit
    if (keyCount >= this.MAX_KEYS) {
      return '[Object has too many keys]';
    }

    if (Array.isArray(obj)) {
      return obj.map((item, index) => {
        if (!this.isValidJsonType(item)) {
          return '[Invalid type]';
        }
        if (typeof item === 'string') {
          return this.sanitizeString(item);
        } else if (typeof item === 'object' && item !== null) {
          return this.sanitizeObject(item, depth + 1, keyCount + index);
        } else {
          return item;
        }
      });
    }

    const sanitized: Record<string, any> = {};
    let currentKeyCount = keyCount;
    for (const [key, value] of Object.entries(obj)) {
      if (currentKeyCount >= this.MAX_KEYS) {
        break; // Stop processing if too many keys
      }

      // Validate key is a string
      if (typeof key !== 'string') {
        continue; // Skip invalid keys
      }

      // Validate value type
      if (!this.isValidJsonType(value)) {
        sanitized[key] = '[Invalid type]';
        currentKeyCount++;
        continue;
      }

      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value, depth + 1, currentKeyCount);
      } else {
        sanitized[key] = value;
      }
      currentKeyCount++;
    }

    return sanitized;
  }
}
