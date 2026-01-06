import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { ALLOWED_SORT_FIELDS } from '../../event/constants/query.constants';

/**
 * Decorator for validating sort field against allowed fields
 * Prevents SQL injection by only allowing safe field names
 * 
 * @param validationOptions - Optional validation options
 * @returns Property decorator function
 */
export function IsSortField(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isSortField',
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
          // Check if value is in allowed sort fields
          return (ALLOWED_SORT_FIELDS as readonly string[]).includes(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `sortField must be one of: ${ALLOWED_SORT_FIELDS.join(', ')}`;
        },
      },
    });
  };
}

