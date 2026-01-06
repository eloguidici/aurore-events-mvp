-- Script SQL para eliminar todos los eventos de la base de datos
-- 
-- Uso:
--   Desde Docker:
--     docker-compose exec postgres psql -U admin -d aurore_events -f /path/to/clear-database.sql
--   
--   Desde fuera de Docker:
--     psql -h localhost -p 5432 -U admin -d aurore_events -f scripts/clear-database.sql

-- Eliminar todos los eventos
DELETE FROM events;

-- Verificar que la tabla está vacía
SELECT COUNT(*) as remaining_events FROM events;

-- Opcional: Resetear secuencias si las hay
-- ALTER SEQUENCE events_id_seq RESTART WITH 1;

