# Análisis de Observabilidad: Prometheus + Grafana

## 📊 Situación Actual

### Métricas Existentes

El sistema ya cuenta con un sistema de métricas básico implementado:

1. **MetricsCollectorService**: Recolecta métricas del buffer y batch worker
   - Buffer: `totalEnqueued`, `totalDropped`, `lastEnqueueTime`, `lastDrainTime`
   - Batch Worker: `totalBatchesProcessed`, `totalEventsProcessed`, `totalInsertTimeMs`, `averageBatchProcessingTimeMs`

2. **BusinessMetricsService**: Métricas de negocio
   - Total de eventos
   - Eventos por servicio
   - Eventos últimas 24 horas / última hora
   - Promedio de eventos por minuto
   - Top servicios
   - Eventos por hora

3. **Endpoints de Métricas**:
   - `GET /metrics` - Métricas del buffer
   - `GET /health/buffer` - Estado y métricas del buffer
   - `GET /health/business` - Métricas de negocio
   - `GET /health/database` - Estado de BD y circuit breaker
   - `GET /health/detailed` - Estado completo del sistema

4. **Persistencia de Métricas**:
   - Métricas históricas guardadas en `metrics/metrics-history.jsonl`
   - Persistencia periódica cada X segundos

### Limitaciones Actuales

- ❌ No hay scraping automático de métricas
- ❌ No hay visualización en tiempo real
- ❌ No hay alertas automáticas
- ❌ No hay dashboards históricos
- ❌ Las métricas están en formato JSON, no en formato Prometheus
- ❌ No hay métricas de infraestructura (CPU, memoria, etc.)

---

## 🎯 Propuesta: Prometheus + Grafana

### ¿Qué es Prometheus?

**Prometheus** es un sistema de monitoreo y alertas de código abierto que:
- Recolecta métricas mediante **scraping** (pull model)
- Almacena métricas como series de tiempo
- Proporciona un lenguaje de consulta (PromQL) para análisis
- Integra con AlertManager para alertas

### ¿Qué es Grafana?

**Grafana** es una plataforma de visualización y análisis que:
- Crea dashboards interactivos
- Visualiza métricas de Prometheus
- Permite crear alertas visuales
- Soporta múltiples fuentes de datos

---

## ✅ Ventajas de Implementar Prometheus + Grafana

### 1. **Observabilidad Completa**
- ✅ Visualización en tiempo real de todas las métricas
- ✅ Histórico de métricas para análisis de tendencias
- ✅ Dashboards personalizables por componente

### 2. **Alertas Automáticas**
- ✅ Alertas cuando el buffer está saturado (>80% utilización)
- ✅ Alertas cuando hay muchos eventos rechazados (drop rate >5%)
- ✅ Alertas cuando la base de datos está lenta
- ✅ Alertas cuando el circuit breaker está abierto

### 3. **Métricas de Infraestructura**
- ✅ CPU, memoria, disco del servidor
- ✅ Métricas de PostgreSQL (conexiones, queries lentas, etc.)
- ✅ Métricas de red

### 4. **Análisis Avanzado**
- ✅ Correlación entre métricas (ej: throughput vs latencia)
- ✅ Identificación de patrones y anomalías
- ✅ Análisis de capacidad y planificación

### 5. **Integración con el Stack Actual**
- ✅ Compatible con NestJS (hay librerías oficiales)
- ✅ Se puede agregar sin romper funcionalidad existente
- ✅ Las métricas actuales se pueden exponer en formato Prometheus

---

## 🏗️ Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────────┐
│                    Aurore Events App                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  /metrics/prometheus endpoint                         │  │
│  │  (formato Prometheus expone todas las métricas)      │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ HTTP GET /metrics/prometheus
                           │ (scraping cada 15 segundos)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Prometheus Server                        │
│  • Scraping automático                                      │
│  • Almacenamiento de series de tiempo                       │
│  • PromQL para consultas                                    │
│  • AlertManager para alertas                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ Query PromQL
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Grafana                                  │
│  • Dashboards interactivos                                  │
│  • Visualización de métricas                               │
│  • Alertas visuales                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Componentes a Implementar

### 1. **Endpoint Prometheus en NestJS**

Crear un nuevo endpoint `GET /metrics/prometheus` que exponga todas las métricas en formato Prometheus:

```typescript
// Formato Prometheus:
# HELP buffer_size Current buffer size
# TYPE buffer_size gauge
buffer_size 1234

# HELP buffer_capacity Buffer capacity
# TYPE buffer_capacity gauge
buffer_capacity 50000

# HELP events_total Total events enqueued
# TYPE events_total counter
events_total 123456
```

**Librería recomendada**: `prom-client` (estándar de la industria)

### 2. **Métricas a Exponer**

#### Métricas del Buffer
- `buffer_size` (gauge) - Tamaño actual del buffer
- `buffer_capacity` (gauge) - Capacidad máxima
- `buffer_utilization_percent` (gauge) - Porcentaje de utilización
- `events_enqueued_total` (counter) - Total de eventos encolados
- `events_dropped_total` (counter) - Total de eventos rechazados
- `events_drop_rate_percent` (gauge) - Tasa de rechazo
- `events_throughput_per_second` (gauge) - Throughput actual

#### Métricas del Batch Worker
- `batches_processed_total` (counter) - Total de batches procesados
- `events_processed_total` (counter) - Total de eventos procesados
- `batch_processing_time_ms` (histogram) - Tiempo de procesamiento
- `batch_insert_time_ms` (histogram) - Tiempo de inserción a BD

#### Métricas de Negocio
- `business_events_total` (counter) - Total de eventos en BD
- `business_events_by_service` (gauge) - Eventos por servicio (labels)
- `business_events_last_24h` (gauge) - Eventos últimas 24h
- `business_events_last_hour` (gauge) - Eventos última hora

#### Métricas de Health
- `health_status` (gauge) - Estado de salud (1=healthy, 0=unhealthy)
- `database_connection_status` (gauge) - Estado de conexión BD
- `circuit_breaker_state` (gauge) - Estado del circuit breaker

#### Métricas de Infraestructura (opcional)
- `process_cpu_usage_percent` (gauge) - Uso de CPU
- `process_memory_usage_bytes` (gauge) - Uso de memoria
- `http_request_duration_ms` (histogram) - Duración de requests
- `http_request_total` (counter) - Total de requests

### 3. **Docker Compose - Servicios**

Agregar Prometheus y Grafana al `docker-compose.yml`:

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    networks:
      - aurore-network

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/var/lib/grafana/dashboards
    networks:
      - aurore-network
    depends_on:
      - prometheus
```

### 4. **Configuración de Prometheus**

Archivo `prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'aurore-events'
    static_configs:
      - targets: ['host.docker.internal:3000']  # App NestJS
        labels:
          service: 'aurore-events'
          environment: 'development'
```

### 5. **Dashboards de Grafana**

✅ **Dashboard Completo Pre-configurado**: `grafana/dashboards/aurore-dashboard.json`

El dashboard incluye **16 paneles** organizados en secciones:

1. **Buffer Metrics** (6 paneles):
   - Buffer Utilization % (gauge con umbrales)
   - Buffer Size vs Capacity (comparativo)
   - Buffer Utilization Over Time (tendencia)
   - Events Throughput (eventos/segundo)
   - Drop Rate % (gauge de alerta)
   - Events Enqueued vs Dropped (comparación)

2. **Batch Worker Metrics** (2 paneles):
   - Batches & Events Processed (contadores)
   - Processing Times p95 (percentil 95)

3. **Business Metrics** (2 paneles):
   - Total Events & Recent (total, 24h, 1h)
   - Events by Service (desglose por servicio)

4. **Health Metrics** (4 paneles):
   - Circuit Breaker State (gauge con estados)
   - Health Status (gauge)
   - Database Connection (gauge)
   - Buffer Health (gauge)

5. **Infrastructure Metrics** (2 paneles):
   - CPU Usage (porcentaje)
   - Memory Usage (MB)

**El dashboard se carga automáticamente** cuando Grafana inicia gracias a la configuración de provisioning.

---

## 🚀 Plan de Implementación

### Fase 1: Setup Básico (1-2 horas)
1. ✅ Instalar `prom-client` en el proyecto
2. ✅ Crear módulo de métricas Prometheus
3. ✅ Crear endpoint `/metrics/prometheus`
4. ✅ Exponer métricas básicas del buffer

### Fase 2: Integración Completa (2-3 horas)
1. ✅ Exponer todas las métricas (buffer, batch, business, health)
2. ✅ Agregar Prometheus y Grafana a docker-compose
3. ✅ Configurar Prometheus para scraping
4. ✅ Verificar que las métricas se recolectan

### Fase 3: Dashboards (2-3 horas)
1. ✅ Crear dashboards básicos en Grafana
2. ✅ Configurar alertas básicas
3. ✅ Documentar dashboards

### Fase 4: Métricas Avanzadas (opcional, 1-2 horas)
1. ✅ Agregar métricas de infraestructura
2. ✅ Agregar métricas de HTTP (duración, status codes)
3. ✅ Configurar alertas avanzadas

**Tiempo total estimado**: 6-10 horas

---

## 💰 Costos

### Self-Hosted (Recomendado para MVP)
- **Prometheus**: Gratis (Docker)
- **Grafana**: Gratis (Docker)
- **Recursos**: ~200MB RAM adicionales
- **Total**: $0

### Cloud (Futuro)
- **Grafana Cloud**: $8/mes (plan básico)
- **Prometheus Cloud**: $10-50/mes según volumen
- **Total**: $18-58/mes

---

## ⚠️ Consideraciones

### Ventajas
- ✅ No rompe funcionalidad existente
- ✅ Las métricas actuales se mantienen
- ✅ Fácil de implementar con NestJS
- ✅ Escalable para producción

### Desafíos
- ⚠️ Requiere configuración inicial de Prometheus/Grafana
- ⚠️ Necesita espacio en disco para almacenar métricas históricas
- ⚠️ Requiere aprendizaje básico de PromQL para queries avanzadas

### Compatibilidad
- ✅ Compatible con Windows (Docker Desktop)
- ✅ Compatible con la arquitectura actual
- ✅ No requiere cambios en la lógica de negocio

---

## 📝 Próximos Pasos

1. **Decisión**: ¿Implementamos Prometheus + Grafana?
2. **Si sí**: Proceder con Fase 1 (setup básico)
3. **Si no**: Mantener métricas actuales y considerar en el futuro

---

## 🔗 Referencias

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [prom-client (NestJS)](https://github.com/siimon/prom-client)
- [NestJS Prometheus Module](https://github.com/willsoto/nestjs-prometheus)
