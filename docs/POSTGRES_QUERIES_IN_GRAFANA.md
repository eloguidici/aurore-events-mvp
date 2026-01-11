# Visualizar Consultas de PostgreSQL en Grafana

## ¿Conviene ver todas las consultas en Grafana?

**Sí, definitivamente conviene** por las siguientes razones:

1. **Debugging de problemas de rendimiento**: Identificar consultas lentas fácilmente
2. **Optimización de consultas**: Ver qué consultas se ejecutan más frecuentemente
3. **Monitoreo de patrones**: Entender el uso de la base de datos
4. **Análisis de rendimiento**: Comparar tiempos de ejecución entre consultas
5. **Troubleshooting**: Identificar consultas problemáticas rápidamente

## Opciones Disponibles

### Opción 1: Usar Datasource de PostgreSQL (Recomendado) ✅

**Ventajas**:
- ✅ Muestra el texto completo de las consultas (sin truncar)
- ✅ Consultas SQL directas a `pg_stat_statements`
- ✅ Más flexible para filtrar y ordenar
- ✅ Mejor para tablas y visualización de texto
- ✅ Puede mostrar consultas históricas desde las vistas

**Limitaciones**:
- Requiere conexión directa a PostgreSQL
- Los datos no se actualizan automáticamente (depende del refresh del panel)

**Cómo funciona**:
1. Grafana se conecta directamente a PostgreSQL
2. Ejecuta queries SQL a `pg_stat_statements` o las vistas creadas
3. Muestra los resultados en paneles de tabla

### Opción 2: Usar Métricas de Prometheus (Limitado)

**Ventajas**:
- ✅ Ya está configurado
- ✅ Se actualiza automáticamente con el scrape interval
- ✅ Integrado con otras métricas

**Limitaciones**:
- ❌ El texto de las consultas está truncado (limitado por tamaño de labels en Prometheus)
- ❌ No ideal para mostrar texto largo
- ❌ Más difícil de filtrar y ordenar

**Cómo funciona**:
1. `postgres_exporter` expone métricas con el label `query`
2. Grafana muestra las métricas en gráficos
3. El texto de la consulta aparece como label, pero puede estar truncado

## Configuración Implementada

### 1. Datasource de PostgreSQL

Se ha creado el datasource de PostgreSQL en:
- **Archivo**: `grafana/provisioning/datasources/postgres.yml`
- **Configuración**: Se conecta a `postgres:5432` con la base de datos `aurore_events`

### 2. Vistas Disponibles en PostgreSQL

Ya existen vistas útiles creadas en `scripts/init-postgres.sql`:

1. **`slow_queries`**: Consultas que tardan más de 1 segundo en promedio
   ```sql
   SELECT * FROM slow_queries ORDER BY mean_exec_time DESC LIMIT 20;
   ```

2. **`top_queries_by_calls`**: Consultas más ejecutadas
   ```sql
   SELECT * FROM top_queries_by_calls LIMIT 20;
   ```

### 3. Panel de Ejemplo

Para agregar un panel que muestre las top queries, puedes:

1. Ir a Grafana: http://localhost:3001
2. Abrir el dashboard "Aurore Events - Complete Dashboard"
3. Click en "Add panel" o "Edit" del dashboard
4. Seleccionar datasource "PostgreSQL"
5. Usar esta query SQL:

```sql
SELECT 
    LEFT(query, 150) as "SQL Query",
    calls as "Executions",
    ROUND(mean_exec_time::numeric, 2) as "Average (ms)",
    ROUND(max_exec_time::numeric, 2) as "Max (ms)",
    ROUND((total_exec_time / 1000)::numeric, 2) as "Total (s)",
    rows as "Rows Processed"
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND query NOT LIKE '%pg_stat%'
ORDER BY mean_exec_time DESC
LIMIT 20;
```

**Nota**: El panel del dashboard ya está configurado con los nombres de columnas en inglés para mejor claridad.

## Paneles Recomendados

### Panel 1: Top Queries by Execution Time

**Tipo**: Table  
**Nota**: Este panel ya está incluido en el dashboard "Aurore Events - Complete Dashboard".

**Query**:
```sql
SELECT 
    LEFT(query, 150) as "SQL Query",
    calls as "Executions",
    ROUND(mean_exec_time::numeric, 2) as "Average (ms)",
    ROUND(max_exec_time::numeric, 2) as "Max (ms)",
    ROUND((total_exec_time / 1000)::numeric, 2) as "Total (s)",
    rows as "Rows Processed"
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND query NOT LIKE '%pg_stat%'
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Panel 2: Top Queries by Number of Executions

**Tipo**: Table  
**Query**:
```sql
SELECT 
    LEFT(query, 150) as "SQL Query",
    calls as "Executions",
    ROUND(mean_exec_time::numeric, 2) as "Average (ms)",
    ROUND((total_exec_time / 1000)::numeric, 2) as "Total (s)",
    rows as "Rows Processed",
    ROUND((rows::numeric / NULLIF(calls, 0))::numeric, 2) as "Rows/Execution"
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND query NOT LIKE '%pg_stat%'
ORDER BY calls DESC
LIMIT 15;
```

### Panel 3: Slow Queries (>1 second)

**Tipo**: Table  
**Query**:
```sql
SELECT 
    LEFT(query, 150) as "SQL Query",
    calls as "Executions",
    ROUND(mean_exec_time::numeric, 2) as "Average (ms)",
    ROUND(max_exec_time::numeric, 2) as "Max (ms)",
    ROUND(stddev_exec_time::numeric, 2) as "Std Dev (ms)",
    ROUND(hit_percent::numeric, 2) as "Cache Hit %"
FROM slow_queries
ORDER BY mean_exec_time DESC
LIMIT 10;
```

## Cómo Agregar Paneles Manualmente en Grafana

1. **Abrir Grafana**: http://localhost:3001
2. **Ir al Dashboard**: "Aurore Events - Complete Dashboard"
3. **Editar Dashboard**: Click en el ícono de edición (lápiz) o "Add panel"
4. **Seleccionar Datasource**: PostgreSQL
5. **Agregar Query SQL**: Usar una de las queries de arriba
6. **Configurar Visualización**: 
   - Seleccionar "Table" como tipo de visualización
   - Ajustar columnas y formato según necesidad
7. **Guardar**: Click en "Save" o "Apply"

## Ventajas vs Desventajas

| Aspecto | Datasource PostgreSQL | Métricas Prometheus |
|---------|----------------------|---------------------|
| Texto completo de queries | ✅ Sí | ❌ Truncado |
| Actualización automática | ⚠️ Depende del refresh | ✅ Automático |
| Integración con métricas | ❌ Separado | ✅ Integrado |
| Filtrado y ordenamiento | ✅ Excelente | ⚠️ Limitado |
| Visualización de tablas | ✅ Ideal | ⚠️ No ideal |
| Rendimiento | ✅ Bueno | ✅ Bueno |

## Recomendación

**Usar ambas opciones**:
- **Métricas de Prometheus**: Para gráficos de tendencias y métricas agregadas
- **Datasource de PostgreSQL**: Para tablas con texto completo de consultas

Esto te da lo mejor de ambos mundos:
- Métricas en tiempo real desde Prometheus
- Detalles completos de consultas desde PostgreSQL

## Notas Importantes

1. **Performance**: Las queries a `pg_stat_statements` son eficientes, pero limitar el resultado (LIMIT) es recomendable
2. **Datos históricos**: `pg_stat_statements` solo muestra estadísticas desde el último reset o reinicio de PostgreSQL
3. **Reset de estadísticas**: Si necesitas resetear las estadísticas, usar la función `reset_query_stats()` creada en `scripts/init-postgres.sql`
4. **Seguridad**: El datasource de PostgreSQL usa las mismas credenciales que la aplicación, asegúrate de que sean seguras en producción

## Ejemplo de Uso

```sql
-- Ver consultas más lentas
SELECT * FROM slow_queries LIMIT 10;

-- Ver consultas más ejecutadas
SELECT * FROM top_queries_by_calls LIMIT 10;

-- Ver consultas con más filas procesadas
SELECT 
    LEFT(query, 200) as query,
    calls,
    ROUND(mean_exec_time::numeric, 2) as avg_ms,
    rows
FROM pg_stat_statements
ORDER BY rows DESC
LIMIT 10;
```
