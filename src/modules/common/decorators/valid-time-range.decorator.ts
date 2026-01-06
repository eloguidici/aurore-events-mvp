import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validator constraint for validating time range
 * Ensures that 'from' timestamp is before 'to' timestamp
 */
@ValidatorConstraint({ name: 'isValidTimeRange', async: false })
export class IsValidTimeRangeConstraint implements ValidatorConstraintInterface {
  /**
   * Validates that 'from' timestamp is before 'to' timestamp
   * 
   * @param value - The value being validated (should be 'to' field)
   * @param args - Validation arguments containing the object and property name
   * @returns true if 'from' < 'to', false otherwise
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

    // Validate that 'from' is before 'to'
    return fromDate < toDate;
  }

  /**
   * Default error message for validation failure
   */
  defaultMessage(args: ValidationArguments): string {
    return "'from' timestamp must be before 'to' timestamp";
  }
}

/**
 * Decorator for validating time range
 * Validates that 'from' timestamp is before 'to' timestamp
 * 
 * This decorator should be applied to the 'to' field of the DTO
 * 
 * @param validationOptions - Optional validation options
 * @returns Property decorator function
 */
export function IsValidTimeRange(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidTimeRange',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: IsValidTimeRangeConstraint,
    });
  };
}

