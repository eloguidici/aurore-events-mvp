import * as sanitizeHtml from 'sanitize-html';

/**
 * Utility for sanitizing user input
 * Removes potentially dangerous HTML/script tags and content
 */
export class Sanitizer {
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
   * Sanitize an object recursively
   * Sanitizes all string values in the object
   * 
   * @param obj - Object to sanitize
   * @returns Sanitized object
   */
  static sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => {
        if (typeof item === 'string') {
          return this.sanitizeString(item);
        } else if (typeof item === 'object' && item !== null) {
          return this.sanitizeObject(item);
        } else {
          return item;
        }
      });
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

