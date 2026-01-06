/**
 * Result of batch insert operation
 * Contains count of successful and failed insertions
 */
export interface BatchInsertResult {
  /**
   * Number of events successfully inserted
   */
  successful: number;

  /**
   * Number of events that failed to insert
   */
  failed: number;
}
