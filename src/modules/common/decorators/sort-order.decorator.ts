import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Decorator for validating sort order (ASC or DESC, case insensitive)
 * 
 * @param validationOptions - Optional validation options
 * @returns Property decorator function
 */
export function IsSortOrder(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isSortOrder',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (value === undefined || value === null) {
            return true; // Optional field
          }
          if (typeof value !== 'string') {
            return false;
          }
          const upperValue = value.toUpperCase();
          return upperValue === 'ASC' || upperValue === 'DESC';
        },
        defaultMessage(args: ValidationArguments) {
          return 'sortOrder must be either ASC or DESC (case insensitive)';
        },
      },
    });
  };
}

