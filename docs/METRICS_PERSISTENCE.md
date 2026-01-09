# 💾 Persistencia de Métricas: Archivo vs Prometheus

## 📊 Dos Sistemas de Persistencia

Actualmente tienes **DOS sistemas independientes** para guardar métricas:

### 1. **Persistencia a Archivo JSONL** (Sistema Actual)

**Servicio**: `MetricsPersistenceService`
- **Ubicación**: `src/modules/event/services/metrics-persistence.service.ts`
- **Dónde guarda**: `metrics/metrics-history.jsonl`
- **Formato**: JSON Lines (un JSON por línea)
- **Frecuencia**: Cada 60 segundos (configurable)
- **Qué guarda**: Snapshots de métricas del buffer y circuit breaker

**Ejemplo de lo que guarda**:
```json
{
  "timestamp": "2026-01-09T20:00:00.000Z",
  "buffer": {
    "size": 1234,
    "capacity": 50000,
    "utilization_percent": "2.47",
    "total_enqueued": 123456,
    "total_dropped": 0,
    "drop_rate_percent": "0.00",
    "throughput_events_per_second": "123.45"
  },
  "circuitBreaker": {
    "state": "CLOSED",
    "failureCount": 0,
    "successCount": 1234
  }
}
```

### 2. **Prometheus** (Sistema de Observabilidad)

**Servicio**: `PrometheusService`
- **Ubicación**: `src/modules/common/services/prometheus.service.ts`
- **Dónde guarda**: Base de datos de series de tiempo de Prometheus
- **Formato**: Series de tiempo (time-series database)
- **Frecuencia**: Scraping cada 15 segundos (configurable en `prometheus.yml`)
- **Retención**: 30 días (configurable)
- **Qué guarda**: Todas las métricas en formato Prometheus

**Ejemplo de lo que guarda**:
```
buffer_size 1234
buffer_utilization_percent 2.47
events_enqueued_total 123456
events_throughput_per_second 123.45
```

---

## 🔄 ¿Están Sincronizados?

**NO**, son sistemas **independientes**:

1. **Archivo JSONL**:
   - Se guarda cada 60 segundos
   - Solo guarda snapshots (momentos específicos)
   - Formato JSON simple
   - Para análisis histórico básico

2. **Prometheus**:
   - Scrapea cada 15 segundos
   - Guarda series de tiempo continuas
   - Formato optimizado para consultas
   - Para observabilidad y alertas

---

## 🤔 ¿Deberían Estar Sincronizados?

### Opción A: Mantener Separados (Actual) ✅

**Ventajas**:
- ✅ Cada sistema optimizado para su propósito
- ✅ Archivo JSONL: simple, fácil de leer
- ✅ Prometheus: potente para análisis y alertas
- ✅ No duplicación innecesaria

**Desventajas**:
- ⚠️ Dos sistemas que guardan lo mismo
- ⚠️ Puede ser confuso

### Opción B: Solo Prometheus (Recomendado) 🎯

**Ventajas**:
- ✅ Una sola fuente de verdad
- ✅ Prometheus es más potente
- ✅ Menos código que mantener
- ✅ Mejor para producción

**Desventajas**:
- ⚠️ Perderías el archivo JSONL simple
- ⚠️ Dependes de Prometheus para todo

### Opción C: Sincronizar Ambos

**Ventajas**:
- ✅ Mantienes ambos sistemas
- ✅ Sincronizados automáticamente

**Desventajas**:
- ⚠️ Más complejidad
- ⚠️ Duplicación de datos

---

## 💡 Recomendación

**Para MVP/Desarrollo**: Mantener ambos (como está ahora)
- Archivo JSONL: útil para debugging rápido
- Prometheus: útil para observabilidad

**Para Producción**: Solo Prometheus
- Más robusto
- Mejor para escalar
- Elimina duplicación

---

## 📝 Estado Actual

### Lo que se guarda en Archivo JSONL:
- ✅ Buffer metrics (size, capacity, utilization, etc.)
- ✅ Circuit breaker state
- ❌ NO guarda: business metrics, batch worker metrics

### Lo que se guarda en Prometheus:
- ✅ Buffer metrics
- ✅ Batch worker metrics
- ✅ Business metrics
- ✅ Health metrics
- ✅ Infraestructura metrics (CPU, memoria)

**Prometheus guarda MÁS información** que el archivo JSONL.

---

## 🔧 Si Quieres Sincronizar

Si quieres que cuando se guarde en el archivo también se actualice Prometheus, podrías:

1. **Opción 1**: Hacer que `MetricsPersistenceService` también actualice Prometheus
2. **Opción 2**: Eliminar el archivo JSONL y usar solo Prometheus
3. **Opción 3**: Mantener ambos independientes (actual)

---

## 📊 Comparación

| Aspecto | Archivo JSONL | Prometheus |
|---------|--------------|------------|
| **Frecuencia** | 60 segundos | 15 segundos |
| **Formato** | JSON simple | Series de tiempo |
| **Retención** | Ilimitada (archivo crece) | 30 días (configurable) |
| **Búsqueda** | Leer archivo completo | Consultas PromQL |
| **Análisis** | Manual | Potente (Grafana) |
| **Alertas** | No | Sí (AlertManager) |
| **Uso** | Debugging simple | Observabilidad profesional |

---

## 🎯 Conclusión

**Actualmente**:
- ✅ Archivo JSONL: Guarda snapshots cada 60s
- ✅ Prometheus: Scrapea métricas cada 15s
- ❌ NO están sincronizados (son independientes)

**Prometheus es más completo** y guarda más métricas que el archivo JSONL.
