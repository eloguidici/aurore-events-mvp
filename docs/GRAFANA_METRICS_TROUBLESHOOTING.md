# Grafana Metrics Troubleshooting - Métricas en Cero

Este documento explica por qué muchos reportes en Grafana están en cero y cómo resolverlo.

---

## 🚀 Quick Fix - Soluciones Rápidas

Si necesitas resolver el problema rápidamente, sigue estos pasos en orden:

### 1. Verificar que todos los servicios están corriendo

```powershell
# Verificar contenedores Docker
docker ps

# Deberías ver todos estos contenedores corriendo:
# - aurore-postgres
# - aurore-postgres-exporter
# - aurore-prometheus
# - aurore-loki
# - aurore-promtail
# - aurore-grafana
```

Si falta alguno, iniciarlo:
```powershell
docker-compose up -d
```

### 2. Verificar que la aplicación NestJS está corriendo

La aplicación NestJS debe estar corriendo en el puerto 3000 para que Prometheus pueda scrapear las métricas.

```powershell
# Verificar que el puerto 3000 está en uso
Test-NetConnection -ComputerName localhost -Port 3000

# Si no está corriendo, iniciarla:
npm run start:dev
```

### 3. Verificar targets en Prometheus

1. Abrir Prometheus: http://localhost:9090
2. Ir a **Status** > **Targets**
3. Verificar que todos los targets están en estado **UP**:
   - `prometheus` (debe estar UP - siempre está UP)
   - `aurore-events` (debe estar UP si la aplicación está corriendo)
   - `postgres` (debe estar UP)

**Si `aurore-events` está DOWN:**
- Verificar que la aplicación está corriendo
- Verificar que responde en http://localhost:3000/metrics/prometheus
- Verificar logs: `docker logs aurore-prometheus`

**Si `postgres` está DOWN:**
- Verificar que postgres_exporter está corriendo: `docker ps | Select-String postgres-exporter`
- Reiniciar postgres_exporter: `docker restart aurore-postgres-exporter`
- Verificar logs: `docker logs aurore-postgres-exporter`

### 4. Reiniciar postgres_exporter (después de cambios en queries.yaml)

Si has actualizado `postgres-exporter/queries.yaml`, necesitas reiniciar postgres_exporter:

```powershell
docker restart aurore-postgres-exporter
```

Luego esperar unos segundos y verificar que el target en Prometheus está UP.

### 5. Verificar métricas disponibles en Prometheus

1. Abrir Prometheus: http://localhost:9090
2. Ir a **Graph**
3. Buscar métricas:

**Métricas de la aplicación:**
```
buffer_size
buffer_capacity
events_throughput_per_second
business_events_total
```

**Métricas de PostgreSQL:**
```
pg_stat_database_numbackends
pg_stat_statements_calls
pg_stat_statements_mean_exec_time_seconds
pg_stat_statements_max_exec_time_seconds
```

Si alguna métrica no aparece en la lista, significa que no está siendo scrapeada correctamente.

### 6. Reiniciar todos los servicios de monitoreo

Si nada funciona, reiniciar todos los servicios:

```powershell
docker-compose restart prometheus postgres_exporter grafana
```

Luego esperar 1-2 minutos y verificar nuevamente en Grafana.

### Checklist de Verificación Rápida

- [ ] Todos los contenedores Docker están corriendo
- [ ] La aplicación NestJS está corriendo en el puerto 3000
- [ ] Prometheus puede acceder a http://localhost:9090
- [ ] Todos los targets en Prometheus están UP
- [ ] Grafana puede acceder a http://localhost:3001
- [ ] Las métricas aparecen en Prometheus (Graph)
- [ ] postgres_exporter fue reiniciado después de cambios en queries.yaml

---

## Problemas Identificados (Solución Detallada)

### 1. Prometheus no puede scrapear la aplicación

**Síntoma**: Todas las métricas de la aplicación (buffer, eventos, etc.) muestran cero o "No data".

**Causa**: 
- Prometheus está configurado para scrapear desde `host.docker.internal:3000`
- La aplicación NestJS puede no estar corriendo
- La aplicación puede estar corriendo en un puerto diferente
- Hay problemas de conectividad entre Prometheus y la aplicación

**Solución**:

**Opción A: Verificar que la aplicación está corriendo**

1. Verificar que la aplicación está corriendo en el puerto 3000:
   ```bash
   # Windows PowerShell
   Test-NetConnection -ComputerName localhost -Port 3000
   
   # O en el navegador
   http://localhost:3000/metrics/prometheus
   ```

2. Si la aplicación no está corriendo, iniciarla:
   ```bash
   npm run start:dev
   # O
   npm run build
   npm run start:prod
   ```

**Opción B: Verificar targets en Prometheus**

1. Abrir Prometheus: http://localhost:9090
2. Ir a "Status" > "Targets"
3. Verificar que `aurore-events` esté en estado "UP"
4. Si está en "DOWN", verificar los logs:
   ```bash
   docker logs aurore-prometheus
   ```

**Opción C: Si la aplicación está en Docker, actualizar la configuración**

Si la aplicación está corriendo en Docker, actualizar `prometheus/prometheus.yml`:

```yaml
  - job_name: 'aurore-events'
    scrape_interval: 15s
    scrape_timeout: 10s
    metrics_path: '/metrics/prometheus'
    static_configs:
      - targets: ['aurore-app:3000']  # Nombre del contenedor
        labels:
          service: 'aurore-events'
          environment: 'development'
          instance: 'aurore-events-1'
```

### 2. Métricas de PostgreSQL no coinciden con el dashboard

**Síntoma**: Métricas de base de datos (duración de consultas, consultas por segundo, etc.) muestran cero.

**Causa**:
- El dashboard busca métricas con labels que no existen
- Las métricas personalizadas de `postgres_exporter` no incluyen `datname` como label
- Los nombres de las métricas no coinciden exactamente

**Solución**:

**Opción A: Verificar métricas disponibles en Prometheus**

1. Abrir Prometheus: http://localhost:9090
2. Ir a "Graph"
3. Buscar métricas con prefijo `pg_stat_statements_`:
   ```
   pg_stat_statements_max_exec_time_seconds
   pg_stat_statements_mean_exec_time_seconds
   pg_stat_statements_calls
   ```

4. Verificar qué labels tienen estas métricas:
   ```
   pg_stat_statements_max_exec_time_seconds
   ```
   
   Si no tienen el label `datname`, el dashboard necesita ser actualizado.

**Opción B: Actualizar queries del dashboard**

Si las métricas no tienen el label `datname`, remover el filtro del dashboard:

```promql
# Antes (con label):
pg_stat_statements_max_exec_time_seconds{datname="aurore_events"} * 1000

# Después (sin label):
pg_stat_statements_max_exec_time_seconds * 1000
```

**Opción C: Actualizar query personalizado de postgres_exporter**

Ya se ha actualizado `postgres-exporter/queries.yaml` para incluir `datname` como label. Si los cambios no se reflejan:

1. Reiniciar postgres_exporter:
   ```bash
   docker restart aurore-postgres-exporter
   ```

2. Verificar que las métricas ahora incluyen `datname`:
   ```
   pg_stat_statements_max_exec_time_seconds{datname="aurore_events"}
   ```

### 3. Métricas de la aplicación no se están actualizando

**Síntoma**: Métricas de buffer, eventos, etc. están en cero incluso cuando hay actividad.

**Causa**:
- El servicio `PrometheusService` no se está inicializando correctamente
- Las métricas no se están actualizando periódicamente
- Hay errores en la actualización de métricas

**Solución**:

**Opción A: Verificar logs de la aplicación**

```bash
# Si la aplicación está en Docker
docker logs aurore-app

# Si está corriendo directamente
# Revisar logs en la consola donde se ejecuta
```

Buscar mensajes como:
- "Prometheus metrics service initialized"
- Errores relacionados con métricas

**Opción B: Verificar endpoint de métricas**

1. Verificar que el endpoint responde:
   ```bash
   # Windows PowerShell
   Invoke-RestMethod -Uri http://localhost:3000/metrics/prometheus -Method GET
   ```

2. Verificar que las métricas están presentes:
   ```bash
   # Buscar métricas específicas
   curl http://localhost:3000/metrics/prometheus | Select-String "buffer_size"
   ```

**Opción C: Verificar que los servicios están inyectados**

Verificar en `src/modules/common/common.module.ts` que `PrometheusService` está registrado y exportado.

### 4. Prometheus no puede scrapear postgres_exporter

**Síntoma**: Métricas de PostgreSQL no están disponibles en Prometheus.

**Causa**:
- postgres_exporter no está corriendo
- Prometheus no puede conectarse a postgres_exporter
- postgres_exporter no puede conectarse a PostgreSQL

**Solución**:

**Opción A: Verificar que postgres_exporter está corriendo**

```bash
docker ps | Select-String "postgres-exporter"
```

Si no está corriendo:
```bash
docker-compose up -d postgres_exporter
```

**Opción B: Verificar logs de postgres_exporter**

```bash
docker logs aurore-postgres-exporter
```

Buscar errores de conexión a PostgreSQL.

**Opción C: Verificar que postgres_exporter está scrapeable**

1. Verificar que el endpoint responde:
   ```bash
   curl http://localhost:9187/metrics
   ```

2. Verificar en Prometheus que el target está "UP":
   - Ir a http://localhost:9090/status/targets
   - Buscar "postgres"
   - Verificar que está en estado "UP"

## Diagnóstico Rápido

### 1. Verificar que todos los servicios están corriendo

```bash
# Verificar contenedores Docker
docker ps

# Deberías ver:
# - aurore-postgres
# - aurore-postgres-exporter
# - aurore-prometheus
# - aurore-loki
# - aurore-promtail
# - aurore-grafana
```

### 2. Verificar targets en Prometheus

1. Abrir http://localhost:9090/status/targets
2. Verificar que todos los targets están en estado "UP":
   - `prometheus` (debe estar UP)
   - `aurore-events` (debe estar UP si la aplicación está corriendo)
   - `postgres` (debe estar UP)

### 3. Verificar métricas disponibles

En Prometheus (http://localhost:9090/graph), buscar:

**Métricas de la aplicación:**
```
buffer_size
buffer_capacity
buffer_utilization_percent
events_enqueued_total
events_throughput_per_second
business_events_total
```

**Métricas de PostgreSQL:**
```
pg_stat_database_numbackends
pg_stat_database_xact_commit
pg_stat_statements_calls
pg_stat_statements_mean_exec_time_seconds
pg_stat_statements_max_exec_time_seconds
```

Si alguna de estas métricas no aparece, hay un problema con el scraping.

### 4. Verificar logs de Grafana

```bash
docker logs aurore-grafana
```

Buscar errores relacionados con el datasource de Prometheus.

## Soluciones Comunes

### Problema: "No data" en todos los paneles

1. Verificar que Prometheus está corriendo: http://localhost:9090
2. Verificar que la aplicación está corriendo: http://localhost:3000/metrics/prometheus
3. Verificar targets en Prometheus: http://localhost:9090/status/targets
4. Verificar que Grafana está conectada a Prometheus: http://localhost:3001/datasources

### Problema: Métricas de aplicación en cero

1. Verificar que la aplicación está corriendo y generando métricas
2. Verificar que el endpoint `/metrics/prometheus` responde
3. Verificar que Prometheus puede scrapear la aplicación
4. Verificar logs de la aplicación para errores

### Problema: Métricas de PostgreSQL en cero

1. Verificar que postgres_exporter está corriendo
2. Verificar que postgres_exporter puede conectarse a PostgreSQL
3. Verificar que las queries personalizadas están cargadas
4. Verificar que Prometheus puede scrapear postgres_exporter
5. Reiniciar postgres_exporter después de cambios en queries.yaml

### Problema: Dashboard muestra métricas incorrectas

1. Verificar que los nombres de las métricas en el dashboard coinciden con las expuestas
2. Verificar que los labels usados en las queries coinciden con los disponibles
3. Actualizar el dashboard si es necesario

## Comandos Útiles

### Reiniciar todos los servicios

```bash
docker-compose restart
```

### Reiniciar solo Prometheus

```bash
docker restart aurore-prometheus
```

### Reiniciar postgres_exporter

```bash
docker restart aurore-postgres-exporter
```

### Ver logs en tiempo real

```bash
# Logs de Prometheus
docker logs -f aurore-prometheus

# Logs de postgres_exporter
docker logs -f aurore-postgres-exporter

# Logs de Grafana
docker logs -f aurore-grafana
```

### Verificar métricas disponibles en Prometheus

```bash
# Listar todas las métricas
curl http://localhost:9090/api/v1/label/__name__/values | ConvertFrom-Json | Select-Object -ExpandProperty data | Where-Object { $_ -like "*buffer*" -or $_ -like "*pg_stat*" }

# Query una métrica específica
curl "http://localhost:9090/api/v1/query?query=buffer_size" | ConvertFrom-Json
```

## 📋 Checklist Completo de Verificación del Sistema de Métricas

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
- ✅ `pg_stat_statements_max_exec_time_seconds{datname="aurore_events"}` - Incluye datname como label
- ✅ `pg_stat_statements_mean_exec_time_seconds{datname="aurore_events"}` - Incluye datname como label
- ✅ `pg_stat_statements_calls{datname="aurore_events"}` - Incluye datname como label

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

### Pasos Necesarios para Aplicar los Cambios

1. **Reiniciar postgres_exporter** (después de cambios en queries.yaml)
   ```powershell
   docker restart aurore-postgres-exporter
   ```

2. **Verificar que postgres_exporter está corriendo**
   ```powershell
   docker ps | Select-String "postgres-exporter"
   ```

3. **Verificar targets en Prometheus**
   - Abrir http://localhost:9090
   - Ir a **Status** > **Targets**
   - Verificar que todos los targets están **UP**

4. **Verificar métricas en Prometheus**
   - Abrir http://localhost:9090
   - Ir a **Graph**
   - Buscar métricas personalizadas: `pg_stat_statements_max_exec_time_seconds{datname="aurore_events"}`

5. **Verificar dashboard en Grafana**
   - Abrir http://localhost:3001
   - Ir al dashboard "Aurore Events - Complete Dashboard"
   - Verificar que los paneles de métricas de PostgreSQL muestran datos

---

## Referencias

- [Prometheus Configuration](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
- [Postgres Exporter Documentation](https://github.com/prometheus-community/postgres_exporter)
- [Grafana Dashboard Documentation](https://grafana.com/docs/grafana/latest/dashboards/)
