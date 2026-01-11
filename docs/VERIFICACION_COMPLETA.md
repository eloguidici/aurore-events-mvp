# Verificación Completa - Sistema de Métricas

Este documento contiene la verificación completa de todos los componentes del sistema de métricas.

## ✅ Cambios Realizados

### 1. Actualizado `postgres-exporter/queries.yaml`

**Problema**: Las métricas personalizadas de `pg_stat_statements` no incluían el label `datname`, pero el dashboard de Grafana las buscaba con ese label.

**Solución**: Actualizado el query para incluir `datname` como label mediante JOIN con `pg_database`:

```yaml
pg_stat_statements:
  query: |
    SELECT
      d.datname,
      pss.query,
      pss.calls,
      ...
    FROM pg_stat_statements pss
    JOIN pg_database d ON pss.dbid = d.oid
    ...
  metrics:
    - datname:
        usage: "LABEL"
        description: "Database name"
    ...
```

**Estado**: ✅ Completado

### 2. Documentación de Troubleshooting

Creados dos documentos de troubleshooting:

- **`docs/GRAFANA_METRICS_TROUBLESHOOTING.md`**: Documentación completa de troubleshooting
- **`docs/GRAFANA_QUICK_FIX.md`**: Guía rápida para resolver problemas comunes

**Estado**: ✅ Completado

## 📋 Verificación de Componentes

### 1. Configuración de Prometheus

**Archivo**: `prometheus/prometheus.yml`

**Targets configurados**:
- ✅ `prometheus` (localhost:9090) - Prometheus mismo
- ✅ `aurore-events` (host.docker.internal:3000) - Aplicación NestJS
- ✅ `postgres` (postgres_exporter:9187) - PostgreSQL metrics

**Estado**: ✅ Correcto

### 2. Configuración de Docker Compose

**Archivo**: `docker-compose.yml`

**Servicios configurados**:
- ✅ `postgres` - PostgreSQL con pg_stat_statements habilitado
- ✅ `postgres_exporter` - Exportador de métricas de PostgreSQL
- ✅ `prometheus` - Sistema de métricas
- ✅ `grafana` - Visualización de métricas
- ✅ `loki` - Sistema de logs
- ✅ `promtail` - Recolector de logs

**Estado**: ✅ Correcto

### 3. Métricas de la Aplicación

**Archivo**: `src/modules/common/services/prometheus.service.ts`

**Métricas expuestas** (verificadas que coinciden con el dashboard):

**Buffer Metrics**:
- ✅ `buffer_size`
- ✅ `buffer_capacity`
- ✅ `buffer_utilization_percent`
- ✅ `events_enqueued_total`
- ✅ `events_dropped_total`
- ✅ `events_drop_rate_percent`
- ✅ `events_throughput_per_second`
- ✅ `buffer_health_status`

**Batch Worker Metrics**:
- ✅ `batches_processed_total`
- ✅ `events_processed_total`
- ✅ `batch_processing_time_ms_bucket` (Histogram)
- ✅ `batch_insert_time_ms_bucket` (Histogram)

**Business Metrics**:
- ✅ `business_events_total`
- ✅ `business_events_last_24h`
- ✅ `business_events_last_hour`
- ✅ `business_events_by_service`

**Health Metrics**:
- ✅ `health_status`
- ✅ `database_connection_status`
- ✅ `circuit_breaker_state`

**Estado**: ✅ Todas las métricas están definidas correctamente

### 4. Dashboard de Grafana

**Archivo**: `grafana/dashboards/aurore-dashboard.json`

**Métricas usadas en el dashboard** (verificadas que existen):

**Métricas de la aplicación**:
- ✅ `buffer_utilization_percent`
- ✅ `buffer_size`
- ✅ `buffer_capacity`
- ✅ `events_throughput_per_second`
- ✅ `events_drop_rate_percent`
- ✅ `events_enqueued_total`
- ✅ `events_dropped_total`
- ✅ `batches_processed_total`
- ✅ `events_processed_total`
- ✅ `business_events_total`
- ✅ `business_events_last_24h`
- ✅ `business_events_last_hour`
- ✅ `business_events_by_service`
- ✅ `circuit_breaker_state`
- ✅ `health_status`
- ✅ `database_connection_status`
- ✅ `buffer_health_status`

**Métricas de PostgreSQL estándar** (expuestas por postgres_exporter):
- ✅ `pg_stat_database_numbackends{datname="aurore_events"}`
- ✅ `pg_stat_database_xact_commit{datname="aurore_events"}`
- ✅ `pg_stat_database_xact_rollback{datname="aurore_events"}`
- ✅ `pg_stat_database_blks_hit{datname="aurore_events"}`
- ✅ `pg_stat_database_blks_read{datname="aurore_events"}`

**Métricas personalizadas de PostgreSQL** (expuestas por queries.yaml):
- ✅ `pg_stat_statements_max_exec_time_seconds{datname="aurore_events"}` - **Ahora incluye datname como label**
- ✅ `pg_stat_statements_mean_exec_time_seconds{datname="aurore_events"}` - **Ahora incluye datname como label**
- ✅ `pg_stat_statements_calls{datname="aurore_events"}` - **Ahora incluye datname como label**

**Nota**: Las métricas personalizadas de `pg_stat_statements` ahora incluyen el label `datname` después de actualizar `queries.yaml`.

**Estado**: ✅ Todas las métricas están correctamente configuradas

### 5. Configuración de Grafana

**Archivos**: 
- `grafana/provisioning/datasources/prometheus.yml` - Prometheus y Loki datasources
- `grafana/provisioning/datasources/postgres.yml` - PostgreSQL datasource

**Datasources configurados**:
- ✅ Prometheus (http://prometheus:9090) - Métricas de aplicación y PostgreSQL
- ✅ Loki (http://loki:3100) - Logs agregados
- ✅ PostgreSQL (postgres:5432) - Queries SQL directas para análisis de queries

**Estado**: ✅ Correcto

## 🔧 Pasos Necesarios para Aplicar los Cambios

### 1. Reiniciar postgres_exporter

Los cambios en `queries.yaml` requieren reiniciar el contenedor:

```powershell
docker restart aurore-postgres-exporter
```

### 2. Verificar que postgres_exporter está corriendo

```powershell
docker ps | Select-String "postgres-exporter"
```

### 3. Verificar targets en Prometheus

1. Abrir http://localhost:9090
2. Ir a **Status** > **Targets**
3. Verificar que todos los targets están **UP**:
   - `prometheus` - Debe estar UP
   - `aurore-events` - Debe estar UP si la aplicación está corriendo
   - `postgres` - Debe estar UP

### 4. Verificar métricas en Prometheus

1. Abrir http://localhost:9090
2. Ir a **Graph**
3. Buscar métricas personalizadas:
   ```
   pg_stat_statements_max_exec_time_seconds{datname="aurore_events"}
   pg_stat_statements_mean_exec_time_seconds{datname="aurore_events"}
   pg_stat_statements_calls{datname="aurore_events"}
   ```

4. Si las métricas aparecen con el label `datname`, los cambios están funcionando.

### 5. Verificar dashboard en Grafana

1. Abrir http://localhost:3001
2. Ir al dashboard "Aurore Events - Complete Dashboard"
3. Verificar que los paneles de métricas de PostgreSQL muestran datos (ya no están en cero)

## ⚠️ Problemas Conocidos y Soluciones

### Problema 1: Prometheus no puede scrapear la aplicación

**Síntoma**: Métricas de la aplicación (buffer, eventos, etc.) están en cero.

**Causa**: La aplicación NestJS no está corriendo en el puerto 3000.

**Solución**:
1. Verificar que la aplicación está corriendo:
   ```powershell
   Test-NetConnection -ComputerName localhost -Port 3000
   ```
2. Si no está corriendo, iniciarla:
   ```powershell
   npm run start:dev
   ```

### Problema 2: Métricas de PostgreSQL siguen en cero

**Síntoma**: Métricas de PostgreSQL (duración de consultas, consultas por segundo) están en cero.

**Causa**: postgres_exporter no se reinició después de cambiar `queries.yaml`.

**Solución**:
1. Reiniciar postgres_exporter:
   ```powershell
   docker restart aurore-postgres-exporter
   ```
2. Esperar 1-2 minutos
3. Verificar en Prometheus que las métricas aparecen

### Problema 3: Métricas personalizadas no incluyen datname

**Síntoma**: Las métricas de `pg_stat_statements` no tienen el label `datname`.

**Causa**: El query personalizado no incluye `datname` o postgres_exporter no se reinició.

**Solución**:
1. Verificar que `queries.yaml` incluye `datname` como label (ya está corregido)
2. Reiniciar postgres_exporter:
   ```powershell
   docker restart aurore-postgres-exporter
   ```

## 📊 Resumen de Verificación

| Componente | Estado | Notas |
|------------|--------|-------|
| postgres-exporter/queries.yaml | ✅ Corregido | Incluye `datname` como label |
| prometheus/prometheus.yml | ✅ Correcto | Targets configurados correctamente |
| docker-compose.yml | ✅ Correcto | Todos los servicios configurados |
| Dashboard de Grafana | ✅ Correcto | Todas las métricas coinciden |
| PrometheusService | ✅ Correcto | Todas las métricas están definidas |
| Documentación | ✅ Creada | Troubleshooting completo |

## ✅ Conclusión

Todos los componentes del sistema de métricas han sido verificados y corregidos. Los cambios principales fueron:

1. ✅ Actualizado `queries.yaml` para incluir `datname` como label
2. ✅ Verificado que todas las métricas del dashboard existen
3. ✅ Verificado que la configuración de Prometheus es correcta
4. ✅ Creada documentación de troubleshooting completa

**Próximos pasos**:
1. Reiniciar postgres_exporter para aplicar los cambios
2. Verificar que las métricas aparecen en Prometheus
3. Verificar que el dashboard de Grafana muestra datos correctamente
