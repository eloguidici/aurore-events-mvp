import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import { createServiceConfig } from '../../config/config-factory';
import { createValidationConfig } from '../../config/config-factory';

// Get config for decorators (static values needed at compile time)
const serviceConfig = createServiceConfig();
const validationConfig = createValidationConfig();

/**
 * Custom validator for parseable timestamp
 * Validates that timestamp can be parsed as a valid date (ISO 8601 or Unix epoch)
 */
@ValidatorConstraint({ name: 'isParseableTimestamp', async: false })
export class IsParseableTimestampConstraint implements ValidatorConstraintInterface {
  /**
   * Validates if timestamp is a parseable date string
   *
   * @param timestamp - Timestamp value to validate
   * @returns true if timestamp is parseable, false otherwise
   */
  validate(timestamp: any) {
    if (typeof timestamp !== 'string') {
      return false;
    }
    const date = new Date(timestamp);
    return !isNaN(date.getTime());
  }

  /**
   * Default error message for validation failure
   */
  defaultMessage() {
    return 'timestamp must be a parseable date (ISO 8601 or Unix epoch)';
  }
}

/**
 * Custom validator for metadata size and structure
 * Validates that metadata object, when serialized to JSON, does not exceed configured limit
 * Also validates depth and key count to prevent performance issues
 * Reads limit from METADATA_MAX_SIZE_KB environment variable (default: 16KB)
 */
@ValidatorConstraint({ name: 'isMetadataSizeValid', async: false })
export class IsMetadataSizeValidConstraint implements ValidatorConstraintInterface {
  // Use values from validationConfig (loaded from environment variables)
  private readonly MAX_DEPTH = validationConfig.metadataMaxDepth;
  private readonly MAX_KEYS = validationConfig.metadataMaxKeys;

  /**
   * Calculate the depth of an object
   *
   * @param obj - Object to calculate depth for
   * @param currentDepth - Current depth (default: 0)
   * @returns Maximum depth of the object
   */
  private calculateDepth(obj: any, currentDepth: number = 0): number {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return currentDepth;
    }

    let maxDepth = currentDepth;
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const depth = this.calculateDepth(value, currentDepth + 1);
        maxDepth = Math.max(maxDepth, depth);
      }
    }

    return maxDepth;
  }

  /**
   * Count total keys in an object (recursively)
   *
   * @param obj - Object to count keys for
   * @param visited - Set of visited objects to prevent circular references
   * @returns Total number of keys
   */
  private countKeys(obj: any, visited: WeakSet<any> = new WeakSet()): number {
    if (!obj || typeof obj !== 'object') {
      return 0;
    }

    if (visited.has(obj)) {
      return 0; // Circular reference detected
    }

    visited.add(obj);

    if (Array.isArray(obj)) {
      return obj.reduce((count, item) => {
        if (typeof item === 'object' && item !== null) {
          return count + this.countKeys(item, visited);
        }
        return count;
      }, 0);
    }

    let count = Object.keys(obj).length;
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        count += this.countKeys(value, visited);
      }
    }

    return count;
  }

  /**
   * Validates if metadata size, depth, and key count are within limits
   *
   * @param metadata - Metadata object to validate
   * @param args - Validation arguments (can contain maxSizeKB as constraint)
   * @returns true if metadata is within all limits or is optional, false otherwise
   */
  validate(metadata: any, args: ValidationArguments) {
    if (!metadata) {
      return true; // Optional field
    }

    if (typeof metadata !== 'object') {
      return false; // Must be an object
    }

    try {
      // Validate size
      const maxSizeKB =
        args.constraints[0] || validationConfig.metadataMaxSizeKB;
      const metadataStr = JSON.stringify(metadata);
      const sizeKB = Buffer.byteLength(metadataStr, 'utf8') / 1024;
      if (sizeKB > maxSizeKB) {
        return false;
      }

      // Validate depth
      const depth = this.calculateDepth(metadata);
      if (depth > this.MAX_DEPTH) {
        return false;
      }

      // Validate key count
      const keyCount = this.countKeys(metadata);
      if (keyCount > this.MAX_KEYS) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Default error message for validation failure
   */
  defaultMessage(args: ValidationArguments) {
    const maxSizeKB = args.constraints[0] || validationConfig.metadataMaxSizeKB;
    return `metadata must not exceed ${maxSizeKB}KB, ${validationConfig.metadataMaxDepth} levels of nesting, or ${validationConfig.metadataMaxKeys} total keys`;
  }
}

/**
 * Decorator for validating parseable timestamp
 *
 * @param validationOptions - Optional validation options
 * @returns Property decorator function
 */
export function IsParseableTimestamp(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsParseableTimestampConstraint,
    });
  };
}

/**
 * Decorator for validating metadata size
 * Reads max size from METADATA_MAX_SIZE_KB environment variable (default: 16KB)
 *
 * @param maxSizeKB - Optional max size in KB (overrides env var)
 * @param validationOptions - Optional validation options
 * @returns Property decorator function
 */
export function IsMetadataSizeValid(
  maxSizeKB?: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    const maxSize = maxSizeKB || validationConfig.metadataMaxSizeKB;
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [maxSize],
      validator: IsMetadataSizeValidConstraint,
    });
  };
}

export class CreateEventDto {
  @ApiProperty({
    description:
      'Event timestamp in ISO 8601 format (UTC) or Unix epoch (must be parseable). All timestamps are stored in UTC.',
    example: '2024-01-15T10:30:00.000Z',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @IsParseableTimestamp()
  timestamp: string; // ISO 8601 (UTC) or Unix epoch (must be parseable, stored as UTC)

  @ApiProperty({
    description: 'Service name that generated the event',
    example: 'user-service',
    maxLength: serviceConfig.nameMaxLength,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(serviceConfig.nameMaxLength, {
    message: `service name must be at most ${serviceConfig.nameMaxLength} characters`,
  })
  service: string;

  @ApiProperty({
    description: 'Event message describing what happened',
    example: 'User logged in successfully',
    maxLength: validationConfig.messageMaxLength,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(validationConfig.messageMaxLength, {
    message: `message must be at most ${validationConfig.messageMaxLength} characters`,
  })
  message: string;

  @ApiPropertyOptional({
    description: `Additional metadata as key-value pairs (max ${validationConfig.metadataMaxSizeKB}KB)`,
    example: { userId: '123', ipAddress: '192.168.1.1' },
    type: Object,
  })
  @IsOptional()
  @IsObject()
  @IsMetadataSizeValid()
  metadata?: Record<string, any>;
}
