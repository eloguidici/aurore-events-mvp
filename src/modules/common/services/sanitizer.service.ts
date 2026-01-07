import { Inject, Injectable } from '@nestjs/common';
import * as sanitizeHtml from 'sanitize-html';

import { CONFIG_TOKENS } from '../../config/tokens/config.tokens';
import { ValidationConfig } from '../../config/interfaces/validation-config.interface';
import { ISanitizerService } from './interfaces/sanitizer-service.interface';

/**
 * Service for sanitizing user input
 * Removes potentially dangerous HTML/script tags and content
 * Injectable service for better testability
 */
@Injectable()
export class SanitizerService implements ISanitizerService {
  constructor(
    @Inject(CONFIG_TOKENS.VALIDATION)
    private readonly validationConfig: ValidationConfig,
  ) {}

  /**
   * Sanitize a string by removing HTML tags and dangerous content
   *
   * @param input - String to sanitize
   * @returns Sanitized string
   */
  sanitizeString(input: string): string {
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
  private isValidJsonType(value: any): boolean {
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
  sanitizeObject(
    obj: any,
    depth: number = 0,
    keyCount: number = 0,
  ): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    // Check depth limit
    if (depth >= this.validationConfig.metadataMaxDepth) {
      return '[Object too deeply nested]';
    }

    // Check key count limit
    if (keyCount >= this.validationConfig.metadataMaxKeys) {
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
      if (currentKeyCount >= this.validationConfig.metadataMaxKeys) {
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

