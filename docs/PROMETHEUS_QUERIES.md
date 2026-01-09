# 🔍 Guía: Qué Buscar en Prometheus

## 📊 Métricas Disponibles

### 1. **Métricas del Buffer** (Cola en Memoria)

#### `buffer_size`
- **Qué es**: Tamaño actual del buffer (cuántos eventos esperando)
- **Cómo buscarlo**: Escribe `buffer_size` en la barra de búsqueda
- **Qué verás**: Un número que cambia en tiempo real
- **Ejemplo de query**: `buffer_size`
- **Cuándo preocuparse**: Si sube mucho (cerca de la capacidad)

#### `buffer_capacity`
- **Qué es**: Capacidad máxima del buffer
- **Cómo buscarlo**: `buffer_capacity`
- **Qué verás**: Un número fijo (ej: 50000)

#### `buffer_utilization_percent`
- **Qué es**: Porcentaje de uso del buffer (0-100%)
- **Cómo buscarlo**: `buffer_utilization_percent`
- **Qué verás**: Un porcentaje que sube y baja
- **Cuándo preocuparse**: 
  - > 70% = Warning (amarillo)
  - > 90% = Critical (rojo)

#### `events_enqueued_total`
- **Qué es**: Total de eventos que entraron al buffer (contador acumulativo)
- **Cómo buscarlo**: `events_enqueued_total`
- **Qué verás**: Un número que solo sube (contador)
- **Query útil**: `rate(events_enqueued_total[1m])` - Eventos por segundo

#### `events_dropped_total`
- **Qué es**: Total de eventos rechazados (buffer lleno)
- **Cómo buscarlo**: `events_dropped_total`
- **Qué verás**: Un número que sube solo cuando hay problemas
- **Cuándo preocuparse**: Si sube, significa que estás perdiendo eventos

#### `events_drop_rate_percent`
- **Qué es**: Porcentaje de eventos rechazados
- **Cómo buscarlo**: `events_drop_rate_percent`
- **Cuándo preocuparse**: 
  - > 1% = Warning
  - > 5% = Critical

#### `events_throughput_per_second`
- **Qué es**: Eventos procesados por segundo
- **Cómo buscarlo**: `events_throughput_per_second`
- **Qué verás**: Un número que muestra el rendimiento actual

#### `buffer_health_status`
- **Qué es**: Estado de salud del buffer
- **Cómo buscarlo**: `buffer_health_status`
- **Valores**:
  - `1` = Healthy (verde)
  - `2` = Warning (amarillo)
  - `3` = Critical (rojo)

---

### 2. **Métricas del Batch Worker** (Procesamiento)

#### `batches_processed_total`
- **Qué es**: Total de lotes procesados
- **Cómo buscarlo**: `batches_processed_total`
- **Query útil**: `rate(batches_processed_total[1m])` - Lotes por segundo

#### `events_processed_total`
- **Qué es**: Total de eventos guardados en BD
- **Cómo buscarlo**: `events_processed_total`
- **Query útil**: `rate(events_processed_total[1m])` - Eventos procesados por segundo

#### `batch_processing_time_ms`
- **Qué es**: Tiempo que tarda procesar un lote (histograma)
- **Cómo buscarlo**: `batch_processing_time_ms`
- **Queries útiles**:
  - `histogram_quantile(0.95, rate(batch_processing_time_ms_bucket[5m]))` - Percentil 95
  - `histogram_quantile(0.50, rate(batch_processing_time_ms_bucket[5m]))` - Mediana

#### `batch_insert_time_ms`
- **Qué es**: Tiempo que tarda guardar en BD (histograma)
- **Cómo buscarlo**: `batch_insert_time_ms`
- **Queries útiles**:
  - `histogram_quantile(0.95, rate(batch_insert_time_ms_bucket[5m]))` - Percentil 95

---

### 3. **Métricas de Negocio** (Business Metrics)

#### `business_events_total`
- **Qué es**: Total de eventos en la base de datos
- **Cómo buscarlo**: `business_events_total`
- **Qué verás**: Número total de eventos almacenados

#### `business_events_last_24h`
- **Qué es**: Eventos en las últimas 24 horas
- **Cómo buscarlo**: `business_events_last_24h`

#### `business_events_last_hour`
- **Qué es**: Eventos en la última hora
- **Cómo buscarlo**: `business_events_last_hour`

#### `business_events_by_service`
- **Qué es**: Eventos agrupados por servicio
- **Cómo buscarlo**: `business_events_by_service`
- **Qué verás**: Múltiples series, una por cada servicio
- **Query útil**: `business_events_by_service{service="user-service"}` - Filtrar por servicio

---

### 4. **Métricas de Salud** (Health Metrics)

#### `health_status`
- **Qué es**: Estado general de la aplicación
- **Cómo buscarlo**: `health_status`
- **Valores**: `1` = healthy, `0` = unhealthy

#### `database_connection_status`
- **Qué es**: Estado de conexión a BD
- **Cómo buscarlo**: `database_connection_status`
- **Valores**: `1` = connected, `0` = disconnected

#### `circuit_breaker_state`
- **Qué es**: Estado del circuit breaker
- **Cómo buscarlo**: `circuit_breaker_state`
- **Valores**:
  - `0` = CLOSED (normal)
  - `1` = OPEN (protegiendo)
  - `2` = HALF_OPEN (probando)

---

### 5. **Métricas de Infraestructura** (Automáticas)

#### `process_cpu_user_seconds_total`
- **Qué es**: CPU usado por el proceso
- **Cómo buscarlo**: `process_cpu_user_seconds_total`
- **Query útil**: `rate(process_cpu_user_seconds_total[1m])` - CPU por segundo

#### `process_resident_memory_bytes`
- **Qué es**: Memoria usada por el proceso
- **Cómo buscarlo**: `process_resident_memory_bytes`
- **Query útil**: `process_resident_memory_bytes / 1024 / 1024` - Convertir a MB

#### `nodejs_heap_size_total_bytes`
- **Qué es**: Tamaño total del heap de Node.js
- **Cómo buscarlo**: `nodejs_heap_size_total_bytes`

---

## 🎯 Queries Útiles para Empezar

### 1. **Ver el tamaño del buffer en tiempo real**
```
buffer_size
```

### 2. **Ver eventos por segundo (throughput)**
```
events_throughput_per_second
```

### 3. **Ver utilización del buffer**
```
buffer_utilization_percent
```

### 4. **Ver si hay eventos rechazados**
```
events_dropped_total
```

### 5. **Ver estado de salud**
```
buffer_health_status
```

### 6. **Ver eventos procesados por segundo**
```
rate(events_processed_total[1m])
```

### 7. **Ver tiempo de procesamiento (p95)**
```
histogram_quantile(0.95, rate(batch_processing_time_ms_bucket[5m]))
```

---

## 📈 Cómo Usar en Prometheus

### Paso 1: Abrir Prometheus
1. Ve a: **http://localhost:9090**
2. Clic en la pestaña **"Graph"**

### Paso 2: Buscar una Métrica
1. En el campo de búsqueda, escribe: `buffer_size`
2. Clic en **"Execute"** o presiona Enter
3. Verás el gráfico en tiempo real

### Paso 3: Ver Tabla de Valores
1. Clic en la pestaña **"Table"**
2. Verás los valores actuales en formato tabla

### Paso 4: Cambiar Rango de Tiempo
1. Arriba a la derecha, selecciona:
   - **Last 5 minutes**: Para ver datos recientes
   - **Last 15 minutes**: Para ver más contexto
   - **Last 1 hour**: Para ver tendencias

---

## 🔥 Queries Avanzadas

### Ver tasa de eventos encolados por segundo
```
rate(events_enqueued_total[1m])
```

### Ver tasa de eventos rechazados por segundo
```
rate(events_dropped_total[1m])
```

### Ver porcentaje de eventos rechazados
```
(rate(events_dropped_total[1m]) / rate(events_enqueued_total[1m])) * 100
```

### Ver eventos por servicio (top 5)
```
topk(5, business_events_by_service)
```

### Ver si el buffer está cerca del límite
```
(buffer_size / buffer_capacity) * 100
```

---

## 💡 Tips

1. **Usa `rate()` para contadores**: Convierte contadores acumulativos en tasas por segundo
2. **Usa `[1m]` o `[5m]`**: Especifica el intervalo de tiempo para calcular la tasa
3. **Usa `histogram_quantile()`**: Para ver percentiles de histogramas (p50, p95, p99)
4. **Usa `topk()`**: Para ver los top N valores
5. **Usa labels**: Para filtrar, ej: `business_events_by_service{service="user-service"}`

---

## 🎯 Métricas Más Importantes para Monitorear

1. ✅ `buffer_utilization_percent` - Si sube mucho, hay problema
2. ✅ `events_drop_rate_percent` - Si sube, estás perdiendo eventos
3. ✅ `events_throughput_per_second` - Rendimiento del sistema
4. ✅ `circuit_breaker_state` - Si es 1 (OPEN), la BD tiene problemas
5. ✅ `buffer_health_status` - Estado general del buffer

---

## 📚 Recursos

- **Ver todas las métricas**: http://localhost:3000/metrics/prometheus
- **Prometheus UI**: http://localhost:9090
- **PromQL Documentation**: https://prometheus.io/docs/prometheus/latest/querying/basics/
