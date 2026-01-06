/**
 * Interface for RetentionService
 * Defines the contract for event retention and cleanup operations
 */
export interface IRetentionService {
  /**
   * Daily cleanup job - runs at configured schedule
   * Deletes events older than retention period
   * 
   * @returns Promise that resolves when cleanup completes
   */
  cleanup(): Promise<void>;

  /**
   * Manual cleanup trigger (for testing or manual runs)
   * 
   * @returns Number of events deleted
   * @throws Error if cleanup fails
   */
  cleanupNow(): Promise<number>;
}

