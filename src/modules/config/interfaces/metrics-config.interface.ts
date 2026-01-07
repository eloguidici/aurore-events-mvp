/**
 * Metrics configuration interface
 */
export interface MetricsConfig {
  historyDefaultLimit: number;
  cacheTtlMs?: number;
  persistenceIntervalMs?: number;
}

