/**
 * Interface for metrics repository
 * Abstracts metrics persistence layer from business logic
 * Allows easy swapping of storage implementations (file, database, etc.)
 */
export interface IMetricsRepository {
  /**
   * Save a metrics snapshot
   *
   * @param snapshot - Metrics snapshot to save
   * @returns Promise that resolves when snapshot is saved
   */
  save(snapshot: MetricsSnapshot): Promise<void>;

  /**
   * Get metrics history (last N entries)
   *
   * @param limit - Maximum number of entries to return
   * @returns Array of metrics snapshots
   */
  getHistory(limit: number): Promise<MetricsSnapshot[]>;
}

/**
 * Metrics snapshot structure
 * Represents a point-in-time snapshot of system metrics
 */
export interface MetricsSnapshot {
  timestamp: string; // ISO 8601 UTC format
  buffer: {
    size: number;
    capacity: number;
    utilization_percent: string;
    total_enqueued: number;
    total_dropped: number;
    drop_rate_percent: string;
    throughput_events_per_second: string;
  };
  circuitBreaker: {
    state: string;
    failureCount: number;
    successCount: number;
  };
}
