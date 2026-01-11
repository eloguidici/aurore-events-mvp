# 📊 Guía Completa de Métricas - Aurore Events MVP

Este documento explica qué son las métricas, qué estamos midiendo, y las diferencias entre métricas de aplicación y métricas de base de datos.

---

## ❌ NO son Logs

**Prometheus NO recolecta logs**. Recolecta **métricas numéricas** (números, contadores, porcentajes) que representan el estado y rendimiento del sistema en tiempo real.

---

## ✅ ¿Qué SÍ estamos midiendo?

### 1. **Métricas del Buffer** (Cola en Memoria)

Estas métricas te dicen qué tan bien está funcionando el buffer que recibe los eventos:

| Métrica | Qué Mide | Ejemplo | ¿Para qué sirve? |
|---------|----------|---------|------------------|
| `buffer_size` | Cuántos eventos hay esperando en el buffer | `1234` eventos | Ver si el buffer se está llenando |
| `buffer_capacity` | Capacidad máxima del buffer | `50000` eventos | Límite configurado |
| `buffer_utilization_percent` | Porcentaje de uso del buffer | `2.47%` | Alertar si > 70% (warning) o > 90% (critical) |
| `events_enqueued_total` | Total de eventos que entraron al buffer | `1,234,567` eventos | Contador acumulativo desde que inició la app |
| `events_dropped_total` | Total de eventos rechazados (buffer lleno) | `5` eventos | Ver si hay pérdida de datos |
| `events_drop_rate_percent` | Porcentaje de eventos rechazados | `0.05%` | Alertar si > 1% (warning) o > 5% (critical) |
| `events_throughput_per_second` | Eventos procesados por segundo | `123.45` eventos/seg | Ver el rendimiento actual |
| `buffer_health_status` | Estado de salud del buffer | `1=healthy, 2=warning, 3=critical` | Estado general del buffer |

**Ejemplo práctico:**
- Si `buffer_utilization_percent` sube a 85%, significa que el buffer está casi lleno
- Si `events_drop_rate_percent` es > 5%, significa que estás perdiendo eventos
- Si `events_throughput_per_second` baja, significa que el sistema está procesando más lento

---

### 2. **Métricas del Batch Worker** (Procesamiento por Lotes)

Estas métricas te dicen qué tan rápido se están procesando los eventos:

| Métrica | Qué Mide | Ejemplo | ¿Para qué sirve? |
|---------|----------|---------|------------------|
| `batches_processed_total` | Total de lotes procesados | `1234` lotes | Ver cuántos lotes se han procesado |
| `events_processed_total` | Total de eventos guardados en BD | `1,234,567` eventos | Ver cuántos eventos se guardaron |
| `batch_processing_time_ms` | Tiempo que tarda procesar un lote | Histograma (p50, p95, p99) | Ver si el procesamiento es lento |
| `batch_insert_time_ms` | Tiempo que tarda guardar en BD | Histograma (p50, p95, p99) | Ver si la BD está lenta |

**Ejemplo práctico:**
- Si `batch_processing_time_ms` (p95) sube a 2000ms, significa que el 95% de los lotes tardan más de 2 segundos
- Si `batch_insert_time_ms` es alto, significa que la base de datos está lenta

---

### 3. **Métricas de Negocio** (Business Metrics)

Estas métricas te dicen qué está pasando con los eventos desde el punto de vista del negocio:

| Métrica | Qué Mide | Ejemplo | ¿Para qué sirve? |
|---------|----------|---------|------------------|
| `business_events_total` | Total de eventos en la base de datos | `1,234,567` eventos | Ver cuántos eventos hay almacenados |
| `business_events_last_24h` | Eventos en las últimas 24 horas | `50,000` eventos | Ver actividad reciente |
| `business_events_last_hour` | Eventos en la última hora | `2,500` eventos | Ver actividad actual |
| `business_events_by_service` | Eventos agrupados por servicio | `{ "user-service": 50000, "auth-service": 30000 }` | Ver qué servicios envían más eventos |

**Ejemplo práctico:**
- Si `business_events_last_hour` baja a 0, significa que no hay actividad
- Si `business_events_by_service` muestra que un servicio envía muchos eventos, puedes investigar por qué

---

### 4. **Métricas de Salud** (Health Metrics)

Estas métricas te dicen si el sistema está funcionando correctamente:

| Métrica | Qué Mide | Ejemplo | ¿Para qué sirve? |
|---------|----------|---------|------------------|
| `health_status` | Estado general de la aplicación | `1=healthy, 0=unhealthy` | Ver si la app está funcionando |
| `database_connection_status` | Estado de conexión a BD | `1=connected, 0=disconnected` | Ver si la BD está disponible |
| `circuit_breaker_state` | Estado del circuit breaker | `0=closed, 1=open, 2=half-open` | Ver si hay problemas con la BD |

**Ejemplo práctico:**
- Si `circuit_breaker_state` = 1 (open), significa que la BD está fallando y el sistema se protegió
- Si `database_connection_status` = 0, significa que no hay conexión a la BD

---

### 5. **Métricas de Infraestructura** (Automáticas)

Prometheus también recolecta métricas del sistema automáticamente:

| Métrica | Qué Mide | Ejemplo | ¿Para qué sirve? |
|---------|----------|---------|------------------|
| `process_cpu_usage_percent` | Uso de CPU del proceso Node.js | `45.2%` | Ver si la app está usando mucho CPU |
| `process_memory_usage_bytes` | Uso de memoria del proceso | `256 MB` | Ver si la app está usando mucha memoria |
| `nodejs_heap_size_total_bytes` | Tamaño total del heap | `512 MB` | Ver uso de memoria de Node.js |

---

## 🔄 ¿Cómo Funciona?

### Flujo de Recolección:

```
1. La aplicación NestJS expone métricas en: GET /metrics/prometheus
   ↓
2. Prometheus hace "scraping" cada 15 segundos (lee las métricas)
   ↓
3. Prometheus almacena las métricas como series de tiempo
   ↓
4. Grafana lee las métricas de Prometheus y las visualiza
```

### Ejemplo de Métrica en Formato Prometheus:

```
# HELP buffer_size Current buffer size
# TYPE buffer_size gauge
buffer_size 1234

# HELP events_enqueued_total Total number of events enqueued
# TYPE events_enqueued_total gauge
events_enqueued_total 1234567
```

**Esto NO es un log**, es un **número** que representa el estado actual del sistema.

---

## 🆚 Diferencia entre Métricas de Aplicación y Métricas de Base de Datos

### Pregunta Frecuente

**¿Por qué algunas métricas están en la base de datos y otras se consultan a la aplicación?**

### Respuesta Corta

Porque miden cosas diferentes y provienen de fuentes diferentes:
- **Métricas de Aplicación**: Las genera la aplicación NestJS sobre su propio comportamiento
- **Métricas de Base de Datos**: Las genera PostgreSQL sobre su propio comportamiento

Ambas se centralizan en Prometheus para que Grafana las visualice.

---

### Métricas de la Aplicación (desde NestJS)

**¿Dónde están?**
- En la aplicación NestJS (puerto 3000)
- Expuestas en: `http://localhost:3000/metrics/prometheus`

**¿Qué miden?**
- Lo que **la aplicación sabe sobre sí misma**:
  - Cuántos eventos hay en el buffer (la aplicación los maneja)
  - Cuántos eventos se procesaron (la aplicación los procesa)
  - El throughput de eventos (la aplicación los genera)
  - El estado de health de la aplicación
  - Eventos de negocio (la aplicación los crea)

**¿Por qué la aplicación?**
- Porque la aplicación es la que **crea y maneja** estos datos
- La aplicación sabe cuántos eventos hay en su buffer interno
- La aplicación sabe cuántos eventos ha procesado
- PostgreSQL **no sabe** nada de esto

**Ejemplo**:
```
buffer_size = 1234  ← La aplicación sabe esto porque los tiene en memoria
events_throughput_per_second = 150.5  ← La aplicación calcula esto
business_events_total = 50000  ← La aplicación cuenta esto
```

---

### Métricas de PostgreSQL (desde postgres_exporter)

**¿Dónde están?**
- En PostgreSQL (a través de postgres_exporter en puerto 9187)
- Expuestas en: `http://localhost:9187/metrics`

**¿Qué miden?**
- Lo que **PostgreSQL sabe sobre sí mismo**:
  - Qué queries SQL se ejecutan
  - Cuánto tardan las queries
  - Cuántas conexiones hay
  - Cache hit rate
  - Estadísticas de la base de datos

**¿Por qué PostgreSQL?**
- Porque PostgreSQL es el que **ejecuta las queries**
- PostgreSQL sabe qué queries se ejecutaron y cuánto tardaron
- PostgreSQL sabe cuántas conexiones tiene
- La aplicación **no sabe** estos detalles internos de PostgreSQL

**Ejemplo**:
```
pg_stat_statements_calls = 15000  ← PostgreSQL sabe esto
pg_stat_statements_mean_exec_time_seconds = 0.123  ← PostgreSQL mide esto
pg_stat_database_numbackends = 5  ← PostgreSQL conoce esto
```

---

### Comparación Visual

```
┌─────────────────────────────────────────────────────────┐
│                    TU PREGUNTA                         │
│  "¿Por qué algunas métricas están en la base y otras   │
│   se consultan a la app?"                              │
└─────────────────────────────────────────────────────────┘
                         │
                         │
          ┌──────────────┴──────────────┐
          │                             │
          ▼                             ▼
┌─────────────────────┐       ┌─────────────────────┐
│  MÉTRICAS DE APP    │       │ MÉTRICAS DE POSTGRES│
│  (NestJS)           │       │ (postgres_exporter) │
├─────────────────────┤       ├─────────────────────┤
│ ¿Qué miden?         │       │ ¿Qué miden?         │
│ - Buffer size       │       │ - Query performance │
│ - Event throughput  │       │ - Connections       │
│ - Events processed  │       │ - Cache hit rate    │
│ - Business events   │       │ - Query statistics  │
├─────────────────────┤       ├─────────────────────┤
│ ¿Por qué aquí?      │       │ ¿Por qué aquí?      │
│ La app sabe sobre   │       │ PostgreSQL sabe     │
│ su propio estado    │       │ sobre su estado     │
└─────────────────────┘       └─────────────────────┘
          │                             │
          │                             │
          └──────────────┬──────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │    PROMETHEUS        │
              │  (Centraliza todo)   │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │      GRAFANA         │
              │  (Visualiza todo)    │
              └──────────────────────┘
```

---

### Analogía Simple

Imagina que tienes un coche:

**Métricas del Coche (desde el coche mismo)**:
- Velocímetro → El coche sabe su velocidad
- Cuentakilómetros → El coche sabe cuántos km ha recorrido
- Nivel de gasolina → El coche sabe cuánta gasolina tiene

**Métricas de la Carretera (desde sensores externos)**:
- Cámaras de tráfico → Saben cuántos coches pasan
- Sensores de peso → Saben el peso de los vehículos
- Contadores de tráfico → Saben el flujo de tráfico

Ambas son importantes, pero miden cosas diferentes:
- El coche sabe sobre **sí mismo**
- Los sensores saben sobre el **entorno** (carretera)

En nuestro caso:
- La aplicación sabe sobre **sí misma** (buffer, eventos, throughput)
- PostgreSQL sabe sobre **sí mismo** (queries, conexiones, rendimiento)

---

### ¿Por qué no todo en un solo lugar?

**Opción 1: Todo en la Aplicación** ❌
- Problema: La aplicación no sabe detalles internos de PostgreSQL

**Opción 2: Todo en PostgreSQL** ❌
- Problema: PostgreSQL no sabe detalles de la aplicación

**Opción 3: Separado pero Centralizado (Actual)** ✅
- Ventaja: Cada componente expone lo que sabe
- La aplicación expone métricas de aplicación
- PostgreSQL expone métricas de base de datos
- Prometheus centraliza todo
- Grafana visualiza todo desde un solo lugar

---

## 📈 ¿Para Qué Sirven Estas Métricas?

### 1. **Detección de Problemas**
- Si `buffer_utilization_percent` > 90% → El buffer está casi lleno, puede perder eventos
- Si `events_drop_rate_percent` > 5% → Estás perdiendo eventos
- Si `batch_processing_time_ms` es alto → El procesamiento es lento

### 2. **Análisis de Rendimiento**
- Ver cuántos eventos por segundo puede procesar el sistema
- Ver si el rendimiento está mejorando o empeorando
- Comparar rendimiento entre diferentes períodos

### 3. **Alertas Automáticas**
- Configurar alertas cuando `buffer_utilization_percent` > 80%
- Alertar cuando `events_drop_rate_percent` > 1%
- Alertar cuando `circuit_breaker_state` = 1 (open)

### 4. **Planificación de Capacidad**
- Ver tendencias de uso para planificar escalamiento
- Identificar picos de carga
- Predecir cuándo necesitarás más recursos

---

## 🆚 Diferencia entre Métricas y Logs

| Aspecto | Métricas (Prometheus) | Logs |
|---------|----------------------|------|
| **Formato** | Números, contadores, porcentajes | Texto, mensajes |
| **Ejemplo** | `buffer_size 1234` | `"Buffer is full, dropping event"` |
| **Volumen** | Bajo (pocos valores numéricos) | Alto (muchos mensajes de texto) |
| **Uso** | Análisis de rendimiento, alertas | Debugging, auditoría |
| **Retención** | 30 días (configurable) | Depende del sistema de logs |
| **Búsqueda** | Consultas con PromQL | Búsqueda de texto |

---

## 🎯 Resumen

**Estamos midiendo:**
- ✅ Números que representan el estado del sistema
- ✅ Contadores de eventos procesados
- ✅ Porcentajes de utilización
- ✅ Tiempos de procesamiento
- ✅ Estados de salud

**NO estamos midiendo:**
- ❌ Logs (mensajes de texto)
- ❌ Traces (seguimiento de requests)
- ❌ Errores detallados (aunque podemos agregarlos)

**Estas métricas te permiten:**
- Ver el estado del sistema en tiempo real
- Detectar problemas antes de que afecten a los usuarios
- Analizar el rendimiento histórico
- Configurar alertas automáticas

**Diferencia clave:**
- **Métricas de Aplicación** → La aplicación NestJS expone lo que sabe sobre sí misma
- **Métricas de PostgreSQL** → PostgreSQL (via postgres_exporter) expone lo que sabe sobre sí mismo
- **Prometheus** → Centraliza ambas fuentes para que Grafana las visualice

---

## Ver Más

- [`docs/ARQUITECTURA_METRICAS.md`](./ARQUITECTURA_METRICAS.md) - Arquitectura completa del sistema de métricas
- [`docs/GRAFANA_GUIDE.md`](./GRAFANA_GUIDE.md) - Cómo ver métricas en Grafana
- [`docs/GRAFANA_METRICS_TROUBLESHOOTING.md`](./GRAFANA_METRICS_TROUBLESHOOTING.md) - Solución de problemas
