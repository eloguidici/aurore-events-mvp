-- Initialize PostgreSQL extensions and monitoring
-- This script runs automatically when the database container starts for the first time

-- Enable pg_stat_statements extension for query tracking
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create a function to reset pg_stat_statements (useful for testing)
CREATE OR REPLACE FUNCTION reset_query_stats()
RETURNS void AS $$
BEGIN
    PERFORM pg_stat_statements_reset();
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION reset_query_stats() TO admin;

-- Create a view for slow queries (queries taking more than 1 second on average)
CREATE OR REPLACE VIEW slow_queries AS
SELECT 
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time,
    min_exec_time,
    stddev_exec_time,
    rows,
    100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
WHERE mean_exec_time > 1000  -- More than 1 second
ORDER BY mean_exec_time DESC
LIMIT 50;

-- Create a view for most executed queries
CREATE OR REPLACE VIEW top_queries_by_calls AS
SELECT 
    LEFT(query, 200) as query_preview,
    calls,
    total_exec_time,
    mean_exec_time,
    rows
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 50;

-- Grant permissions to views
GRANT SELECT ON slow_queries TO admin;
GRANT SELECT ON top_queries_by_calls TO admin;
