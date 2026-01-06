/**
 * Constants for event query operations
 */

/**
 * Default sort field when none is specified
 */
export const DEFAULT_SORT_FIELD = 'timestamp';

/**
 * Allowed sort fields for event queries
 * Only these fields can be used for sorting to prevent SQL injection
 */
export const ALLOWED_SORT_FIELDS = [
  'timestamp',
  'service',
  'message',
  'ingestedAt',
  'createdAt',
] as const;

/**
 * Type for allowed sort fields
 */
export type AllowedSortField = typeof ALLOWED_SORT_FIELDS[number];

