/**
 * Rate limiting configuration interface
 */
export interface RateLimitingConfig {
  ttlMs: number;
  globalLimit: number;
  ipLimit: number;
  queryLimit: number;
  healthLimit: number;
}
