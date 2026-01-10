import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import { createQueryConfig } from '../../config/config-factory';

// Get config for decorators (static values needed at compile time)
const queryConfig = createQueryConfig();

/**
 * Validator constraint for validating maximum time range
 * Ensures that the time range between 'from' and 'to' does not exceed the configured maximum
 */
@ValidatorConstraint({ name: 'isMaxTimeRange', async: false })
export class IsMaxTimeRangeConstraint implements ValidatorConstraintInterface {
  /**
   * Validates that the time range between 'from' and 'to' does not exceed maximum
   *
   * @param value - The value being validated (should be 'to' field)
   * @param args - Validation arguments containing the object and property name
   * @returns true if time range is within limit, false otherwise
   */
  validate(value: any, args: ValidationArguments): boolean {
    const obj = args.object as any;
    const from = obj.from;
    const to = value;

    // If either field is missing, let other validators handle it
    if (!from || !to) {
      return true;
    }

    // Validate that both are valid dates
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return true; // Let IsDate or other validators handle invalid dates
    }

    // Calculate time difference in days
    const timeDiffMs = toDate.getTime() - fromDate.getTime();
    const timeDiffDays = timeDiffMs / (1000 * 60 * 60 * 24);

    // Get max range from constraint or config
    const maxDays = args.constraints[0] || queryConfig.maxTimeRangeDays;

    // Validate that time range does not exceed maximum
    return timeDiffDays <= maxDays;
  }

  /**
   * Default error message for validation failure
   */
  defaultMessage(args: ValidationArguments): string {
    const maxDays = args.constraints[0] || queryConfig.maxTimeRangeDays;
    return `Time range between 'from' and 'to' must not exceed ${maxDays} days`;
  }
}

/**
 * Decorator for validating maximum time range
 * Validates that the time range between 'from' and 'to' does not exceed the configured maximum
 *
 * This decorator should be applied to the 'to' field of the DTO
 *
 * @param maxDays - Optional maximum days (overrides env var)
 * @param validationOptions - Optional validation options
 * @returns Property decorator function
 */
export function IsMaxTimeRange(
  maxDays?: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isMaxTimeRange',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [maxDays],
      validator: IsMaxTimeRangeConstraint,
    });
  };
}
