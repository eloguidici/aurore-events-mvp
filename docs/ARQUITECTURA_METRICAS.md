# Arquitectura del Sistema de Métricas

## ¿Por qué hay métricas en dos lugares?

Hay **dos tipos de métricas** que se recopilan de **diferentes fuentes**:

### 1. Métricas de la Aplicación (NestJS) 📱

**Fuente**: La aplicación NestJS que corre en el puerto 3000

**Qué miden**:
- **Buffer metrics**: Tamaño del buffer, capacidad, utilización, eventos encolados/dropeados
- **Eventos**: Throughput, eventos procesados, eventos de negocio
- **Worker metrics**: Batches procesados, tiempos de procesamiento
- **Health metrics**: Estado de la aplicación, circuit breaker, conexión a la BD
- **Business metrics**: Eventos totales, eventos por servicio, eventos en las últimas 24h

**Cómo se exponen**:
- La aplicación NestJS tiene un servicio (`PrometheusService`) que recolecta estas métricas
- Estas métricas se exponen en el endpoint: `http://localhost:3000/metrics/prometheus`
- Prometheus scrapea este endpoint cada 15 segundos

**Ejemplo de métricas**:
```
buffer_size 1234
buffer_utilization_percent 45.6
events_throughput_per_second 150.5
business_events_total 50000
```

### 2. Métricas de PostgreSQL (Base de Datos) 🗄️

**Fuente**: PostgreSQL a través de `postgres_exporter`

**Qué miden**:
- **Query performance**: Tiempo de ejecución de queries, cantidad de ejecuciones
- **Database stats**: Conexiones activas, transacciones, cache hit rate
- **Query details**: Consultas SQL específicas con sus estadísticas
- **System stats**: Uso de memoria, bloques leídos/escritos

**Cómo se exponen**:
- `postgres_exporter` es un servicio separado que se conecta a PostgreSQL
- Lee estadísticas de `pg_stat_statements` y otras vistas del sistema
- Expone métricas en: `http://localhost:9187/metrics`
- Prometheus scrapea este endpoint cada 15 segundos

**Ejemplo de métricas**:
```
pg_stat_database_numbackends{datname="aurore_events"} 5
pg_stat_statements_mean_exec_time_seconds{datname="aurore_events", query="SELECT * FROM events"} 0.123
pg_stat_database_blks_hit{datname="aurore_events"} 12345
```

## Arquitectura Visual

```
┌─────────────────────────────────────────────────────────────┐
│                     PROMETHEUS                              │
│              (Centraliza todas las métricas)                │
└──────────────┬───────────────────────────┬──────────────────┘
               │                           │
               │ Scrape cada 15s           │ Scrape cada 15s
               │                           │
    ┌──────────▼──────────┐    ┌──────────▼──────────┐
    │   Aplicación NestJS │    │  postgres_exporter  │
    │   Puerto: 3000      │    │  Puerto: 9187       │
    └──────────┬──────────┘    └──────────┬──────────┘
               │                          │
               │ Expone métricas          │ Expone métricas
               │ de la aplicación         │ de PostgreSQL
               │                          │
    ┌──────────▼──────────┐    ┌──────────▼──────────┐
    │ PrometheusService   │    │   PostgreSQL        │
    │ - Buffer metrics    │    │   - pg_stat_*       │
    │ - Event metrics     │    │   - Database stats  │
    │ - Business metrics  │    │   - Query stats     │
    │ - Health metrics    │    │                     │
    └─────────────────────┘    └─────────────────────┘
```

## ¿Por qué dos fuentes diferentes?

### Razón 1: Responsabilidades Separadas

- **Aplicación NestJS**: Conoce su propio estado interno
  - Sabe cuántos eventos hay en el buffer
  - Sabe cuántos eventos ha procesado
  - Sabe su estado de salud

- **PostgreSQL**: Conoce su propio estado interno
  - Sabe qué queries se ejecutan
  - Sabe cuántas conexiones tiene
  - Sabe el rendimiento de cada query

### Razón 2: Diferentes Tecnologías

- **Aplicación NestJS**: Usa `prom-client` (librería Node.js) para exponer métricas
- **PostgreSQL**: Necesita `postgres_exporter` (servicio externo) para exponer métricas
  - PostgreSQL no puede exponer métricas en formato Prometheus directamente
  - `postgres_exporter` es un servicio especializado que convierte estadísticas de PostgreSQL a formato Prometheus

### Razón 3: Escalabilidad y Separación

- **Aplicación NestJS**: Puede tener múltiples instancias
  - Cada instancia expone sus propias métricas
  - Prometheus scrapea cada instancia por separado

- **PostgreSQL**: Generalmente es una instancia única (o un cluster)
  - `postgres_exporter` se conecta a PostgreSQL y expone métricas agregadas
  - No necesita múltiples exporters por instancia de aplicación

## Flujo Completo de Métricas

### Métricas de la Aplicación

```
1. La aplicación NestJS ejecuta código
   ↓
2. PrometheusService actualiza métricas internas
   (cada 5 segundos actualiza: buffer_size, events_throughput, etc.)
   ↓
3. Endpoint /metrics/prometheus expone métricas
   (formato Prometheus: texto plano)
   ↓
4. Prometheus scrapea el endpoint cada 15s
   ↓
5. Grafana consulta Prometheus para mostrar gráficos
```

### Métricas de PostgreSQL

```
1. PostgreSQL ejecuta queries SQL
   ↓
2. pg_stat_statements registra estadísticas
   (tiempos, ejecuciones, filas procesadas)
   ↓
3. postgres_exporter consulta pg_stat_statements
   (cada vez que Prometheus scrapea)
   ↓
4. postgres_exporter expone métricas en /metrics
   (formato Prometheus: texto plano)
   ↓
5. Prometheus scrapea el endpoint cada 15s
   ↓
6. Grafana consulta Prometheus para mostrar gráficos
```

## Resumen

| Aspecto | Métricas de Aplicación | Métricas de PostgreSQL |
|---------|------------------------|------------------------|
| **Fuente** | Aplicación NestJS (Puerto 3000) | PostgreSQL via postgres_exporter (Puerto 9187) |
| **Qué miden** | Estado de la aplicación (buffer, eventos, health) | Estado de la base de datos (queries, conexiones, rendimiento) |
| **Cómo se exponen** | Endpoint `/metrics/prometheus` | Endpoint `/metrics` de postgres_exporter |
| **Quién las genera** | PrometheusService (código Node.js) | postgres_exporter (servicio externo) |
| **Tecnología** | prom-client (librería Node.js) | postgres_exporter (Go binary) |
| **Datos** | Métricas de negocio y aplicación | Estadísticas de base de datos |
| **Ejemplo** | `buffer_size`, `events_throughput_per_second` | `pg_stat_statements_calls`, `pg_stat_database_numbackends` |

## Ventajas de Esta Arquitectura

1. **Separación de responsabilidades**: Cada componente expone solo lo que conoce
2. **Escalabilidad**: Cada instancia de aplicación expone sus propias métricas
3. **Especialización**: `postgres_exporter` es especialista en métricas de PostgreSQL
4. **Flexibilidad**: Puedes agregar más exporters (Redis, Kafka, etc.) sin cambiar la aplicación
5. **Unificación**: Prometheus centraliza todas las métricas en un solo lugar

## ¿Por qué Prometheus las centraliza?

Prometheus actúa como un **recolector central**:

- **Scrapea** métricas de múltiples fuentes (aplicación, PostgreSQL, etc.)
- **Almacena** todas las métricas en una sola base de datos de series de tiempo
- **Expone** una API unificada para que Grafana consulte todas las métricas
- **Permite** hacer queries que combinan métricas de diferentes fuentes

Sin Prometheus, tendrías que:
- Consultar cada fuente por separado
- Combinar los datos manualmente
- Gestionar múltiples conexiones desde Grafana

Con Prometheus:
- Grafana solo necesita conectarse a Prometheus
- Prometheus ya tiene todas las métricas centralizadas
- Puedes hacer queries que combinen métricas de aplicación y base de datos

## Ejemplo Práctico

Si quieres ver "cuántos eventos se procesaron por segundo" y "cuántas queries SQL se ejecutaron":

**Sin Prometheus**:
- Consultar aplicación NestJS: `events_throughput_per_second`
- Consultar postgres_exporter: `pg_stat_statements_calls`
- Combinar manualmente en Grafana

**Con Prometheus**:
- Prometheus ya tiene ambas métricas
- Grafana consulta Prometheus una sola vez
- Puedes mostrar ambas métricas en el mismo dashboard
- Puedes hacer queries que las relacionen

## Conclusión

**Dos fuentes, un destino**:
- Aplicación NestJS → Expone métricas de aplicación
- PostgreSQL (via postgres_exporter) → Expone métricas de base de datos
- Prometheus → Centraliza todas las métricas
- Grafana → Visualiza todas las métricas desde Prometheus

Esta arquitectura es estándar en sistemas modernos de monitoreo y te da lo mejor de ambos mundos: métricas detalladas de aplicación y métricas detalladas de base de datos, todo en un solo lugar (Prometheus) para visualización (Grafana).
