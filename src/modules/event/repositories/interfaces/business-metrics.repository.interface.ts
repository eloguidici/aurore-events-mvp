/**
 * Type for service count query result
 * PostgreSQL COUNT() returns as string
 */
export interface ServiceCountRow {
  service: string;
  count: string;
}

/**
 * Type for hourly count query result
 * PostgreSQL TO_CHAR returns as string
 */
export interface HourlyCountRow {
  hour: string;
  count: string;
}

/**
 * Interface for Business Metrics Repository
 * Defines the contract for accessing business metrics data
 * This abstraction allows changing the ORM without modifying BusinessMetricsService
 */
export interface IBusinessMetricsRepository {
  /**
   * Get total count of events in the database
   *
   * @returns Total number of events
   */
  getTotalEventsCount(): Promise<number>;

  /**
   * Get event counts grouped by service
   *
   * @returns Array of service count rows
   */
  getEventsByService(): Promise<ServiceCountRow[]>;

  /**
   * Get event counts for different time ranges
   *
   * @param last24Hours - Date representing 24 hours ago
   * @param lastHour - Date representing 1 hour ago
   * @returns Object with counts for last 24 hours and last hour
   */
  getEventsByTimeRange(
    last24Hours: Date,
    lastHour: Date,
  ): Promise<{
    eventsLast24Hours: number;
    eventsLastHour: number;
  }>;

  /**
   * Get events grouped by hour for the last 24 hours
   *
   * @param last24Hours - Date representing 24 hours ago
   * @returns Array of hourly event counts
   */
  getEventsByHour(last24Hours: Date): Promise<HourlyCountRow[]>;
}
