import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  MaxLength,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { envs } from '../../config/envs';

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
   * @param args - Validation arguments
   * @returns true if timestamp is parseable, false otherwise
   */
  validate(timestamp: any, args: ValidationArguments) {
    if (typeof timestamp !== 'string') {
      return false;
    }
    const date = new Date(timestamp);
    return !isNaN(date.getTime());
  }

  /**
   * Default error message for validation failure
   */
  defaultMessage(args: ValidationArguments) {
    return 'timestamp must be a parseable date (ISO 8601 or Unix epoch)';
  }
}

/**
 * Custom validator for metadata size
 * Validates that metadata object, when serialized to JSON, does not exceed configured limit
 * Reads limit from METADATA_MAX_SIZE_KB environment variable (default: 16KB)
 */
@ValidatorConstraint({ name: 'isMetadataSizeValid', async: false })
export class IsMetadataSizeValidConstraint implements ValidatorConstraintInterface {
  /**
   * Validates if metadata size is within configured limit
   *
   * @param metadata - Metadata object to validate
   * @param args - Validation arguments (can contain maxSizeKB as constraint)
   * @returns true if metadata is within size limit or is optional, false otherwise
   */
  validate(metadata: any, args: ValidationArguments) {
    if (!metadata) {
      return true; // Optional field
    }
    try {
      // Get max size from constraint or validated envs
      const maxSizeKB = args.constraints[0] || envs.metadataMaxSizeKB;
      const metadataStr = JSON.stringify(metadata);
      const sizeKB = Buffer.byteLength(metadataStr, 'utf8') / 1024;
      return sizeKB <= maxSizeKB;
    } catch {
      return false;
    }
  }

  /**
   * Default error message for validation failure
   */
  defaultMessage(args: ValidationArguments) {
    const maxSizeKB = args.constraints[0] || envs.metadataMaxSizeKB;
    return `metadata size must not exceed ${maxSizeKB}KB`;
  }
}

/**
 * Decorator for validating parseable timestamp
 *
 * @param validationOptions - Optional validation options
 * @returns Property decorator function
 */
export function IsParseableTimestamp(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
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
  return function (object: Object, propertyName: string) {
    const maxSize = maxSizeKB || envs.metadataMaxSizeKB;
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
      'Event timestamp in ISO 8601 format or Unix epoch (must be parseable)',
    example: '2024-01-15T10:30:00Z',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @IsParseableTimestamp()
  timestamp: string; // ISO 8601 or Unix epoch (must be parseable)

  @ApiProperty({
    description: 'Service name that generated the event',
    example: 'user-service',
    maxLength: envs.serviceNameMaxLength,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(envs.serviceNameMaxLength, {
    message: `service name must be at most ${envs.serviceNameMaxLength} characters`,
  })
  service: string;

  @ApiProperty({
    description: 'Event message describing what happened',
    example: 'User logged in successfully',
    maxLength: envs.messageMaxLength,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(envs.messageMaxLength, {
    message: `message must be at most ${envs.messageMaxLength} characters`,
  })
  message: string;

  @ApiPropertyOptional({
    description: `Additional metadata as key-value pairs (max ${envs.metadataMaxSizeKB}KB)`,
    example: { userId: '123', ipAddress: '192.168.1.1' },
    type: Object,
  })
  @IsOptional()
  @IsObject()
  @IsMetadataSizeValid()
  metadata?: Record<string, any>;
}
