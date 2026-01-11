import { Logger } from '@nestjs/common';
import { Logger as TypeORMLogger, QueryRunner } from 'typeorm';

import { PrometheusService } from '../services/prometheus.service';

/**
 * TypeORM Logger that captures database queries and records metrics to Prometheus
 * Integrates with PrometheusService to track query performance
 * 
 * Note: TypeORM only calls logQuerySlow for queries exceeding maxQueryExecutionTime
 * and logQueryError for failed queries. For complete query tracking, consider
 * using pg_stat_statements metrics from postgres-exporter.
 */
export class TypeOrmPrometheusLogger implements TypeORMLogger {
  private readonly logger = new Logger(TypeOrmPrometheusLogger.name);

  constructor(private readonly prometheusService?: PrometheusService) {}

  /**
   * Logs query and parameters (if query logging is enabled)
   * TypeORM calls this before query execution, but we can't measure duration here
   */
  logQuery(query: string, parameters?: any[], queryRunner?: QueryRunner): void {
    // TypeORM doesn't provide a callback after successful query completion
    // We can only track slow queries (via logQuerySlow) and errors (via logQueryError)
  }

  /**
   * Logs query that failed after execution
   * Records metrics for failed queries
   */
  logQueryError(
    error: string | Error,
    query: string,
    parameters?: any[],
    queryRunner?: QueryRunner,
  ): void {
    if (!this.prometheusService) return;

    const { queryType, operation } = this.parseQuery(query);

    // Record metrics for failed query (duration unknown, but still count it)
    // We use a default duration of 0 to indicate unknown
    this.prometheusService.recordQueryMetrics({
      queryType,
      operation,
      duration: 0, // Duration unknown for errors without timing
    });
  }

  /**
   * Logs query that is slow (takes longer than given max execution time)
   * Records metrics for slow queries
   * This is called automatically by TypeORM when maxQueryExecutionTime is set
   */
  logQuerySlow(
    time: number,
    query: string,
    parameters?: any[],
    queryRunner?: QueryRunner,
  ): void {
    if (!this.prometheusService) return;

    const { queryType, operation } = this.parseQuery(query);

    // Record metrics for slow query
    // Time is in milliseconds
    this.prometheusService.recordQueryMetrics({
      queryType,
      operation,
      duration: time,
      isSlowQuery: true,
    });
  }

  /**
   * Logs events from the schema build process
   */
  logSchemaBuild(message: string, queryRunner?: QueryRunner): void {
    // Not tracking schema build queries as metrics
  }

  /**
   * Logs migration events
   */
  logMigration(message: string, queryRunner?: QueryRunner): void {
    // Not tracking migration queries as metrics
  }

  /**
   * Performs logging using given logger, or by default to the console
   */
  log(
    level: 'log' | 'info' | 'warn',
    message: any,
    queryRunner?: QueryRunner,
  ): void {
    // Not tracking general logs as metrics
  }

  /**
   * Parse SQL query to extract query type and operation
   * Enhanced to better handle TypeORM query builder queries
   * @private
   */
  private parseQuery(query: string): { queryType: string; operation: string } {
    // Normalize query: remove extra whitespace and convert to uppercase
    const normalizedQuery = query.trim().replace(/\s+/g, ' ').toUpperCase();

    // Extract query type (SELECT, INSERT, UPDATE, DELETE, etc.)
    let queryType = 'UNKNOWN';
    let operation = 'unknown';

    // Match common SQL patterns
    if (normalizedQuery.startsWith('SELECT')) {
      queryType = 'SELECT';
      // Try to extract table name from FROM clause
      const fromMatch = normalizedQuery.match(/FROM\s+["\']?(\w+)["\']?/i);
      operation = fromMatch ? fromMatch[1].toLowerCase() : 'select';
    } else if (normalizedQuery.startsWith('INSERT')) {
      queryType = 'INSERT';
      const intoMatch = normalizedQuery.match(/INTO\s+["\']?(\w+)["\']?/i);
      operation = intoMatch ? intoMatch[1].toLowerCase() : 'insert';
    } else if (normalizedQuery.startsWith('UPDATE')) {
      queryType = 'UPDATE';
      const updateMatch = normalizedQuery.match(/UPDATE\s+["\']?(\w+)["\']?/i);
      operation = updateMatch ? updateMatch[1].toLowerCase() : 'update';
    } else if (normalizedQuery.startsWith('DELETE')) {
      queryType = 'DELETE';
      const fromMatch = normalizedQuery.match(/FROM\s+["\']?(\w+)["\']?/i);
      operation = fromMatch ? fromMatch[1].toLowerCase() : 'delete';
    } else if (normalizedQuery.startsWith('CREATE')) {
      queryType = 'CREATE';
      operation = 'schema';
    } else if (normalizedQuery.startsWith('ALTER')) {
      queryType = 'ALTER';
      operation = 'schema';
    } else if (normalizedQuery.startsWith('DROP')) {
      queryType = 'DROP';
      operation = 'schema';
    }

    return { queryType, operation };
  }
}
