/**
 * Interface for MetricsPersistenceService
 * Defines the contract for metrics persistence operations
 */
export interface IMetricsPersistenceService {
  /**
   * Get metrics history (last N entries)
   *
   * @param limit - Maximum number of entries to return (default: 100)
   * @returns Array of metrics snapshots
   */
  getMetricsHistory(limit?: number): Promise<any[]>;
}

