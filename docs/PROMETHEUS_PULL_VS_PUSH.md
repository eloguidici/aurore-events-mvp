# 🔄 Prometheus: Pull Model vs Push Model

## ❌ Lo que NO hacemos (Push Model)

**NO enviamos datos a Prometheus**. No hay código que haga:
```typescript
// ❌ ESTO NO EXISTE EN NUESTRO CÓDIGO
await prometheusClient.push({
  buffer_size: 1234,
  events_total: 5678
});
```

## ✅ Lo que SÍ hacemos (Pull Model)

**Prometheus nos pide los datos**. Es como un cliente que viene a nuestra tienda:

### Flujo Real:

```
1. Tu aplicación corre en el puerto 3000
   └─> Expone endpoint: GET /metrics/prometheus
   └─> Espera a que alguien le pida las métricas

2. Prometheus (cada 15 segundos):
   └─> Hace HTTP GET: http://host.docker.internal:3000/metrics/prometheus
   └─> Tu aplicación responde con las métricas en texto plano
   └─> Prometheus las guarda en su base de datos

3. Grafana:
   └─> Lee las métricas de Prometheus
   └─> Las muestra en dashboards
```

## 📊 Comparación

| Aspecto | Push Model | Pull Model (Prometheus) |
|---------|-----------|------------------------|
| **Quién inicia** | Tu aplicación | Prometheus |
| **Cuándo** | Cuando quieras | Cada 15 segundos (configurable) |
| **Código necesario** | Cliente que envía | Solo endpoint HTTP |
| **Ventaja** | Control total | Simple, estándar |
| **Desventaja** | Más complejo | Menos control sobre timing |

## 🔍 En nuestro código:

### 1. **PrometheusService** (prepara las métricas)
```typescript
// Solo prepara las métricas en memoria
// NO las envía a ningún lado
private async updateMetrics(): Promise<void> {
  this.updateBufferMetrics();
  this.updateBatchWorkerMetrics();
  // ... etc
}
```

### 2. **PrometheusController** (expone el endpoint)
```typescript
@Get('metrics/prometheus')
async getPrometheusMetrics(@Res() res: Response) {
  // Solo responde cuando alguien le pide
  const metrics = await this.prometheusService.getMetrics();
  res.send(metrics); // Responde con las métricas
}
```

### 3. **Prometheus** (pide los datos)
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'aurore-events'
    scrape_interval: 15s  # ← Cada 15 segundos
    metrics_path: '/metrics/prometheus'  # ← Hace GET a este endpoint
    static_configs:
      - targets: ['host.docker.internal:3000']  # ← Tu aplicación
```

## 🎯 Analogía Simple

**Push Model** (NO usamos):
- Como enviar un email: "Aquí están mis métricas"
- Tu aplicación decide cuándo enviar

**Pull Model** (SÍ usamos):
- Como una tienda: Prometheus viene cada 15 segundos y pregunta "¿Qué métricas tienes?"
- Tu aplicación solo responde cuando le preguntan

## ✅ Resumen

1. **Tu aplicación**: Solo expone un endpoint HTTP
2. **Prometheus**: Hace scraping (pide) cada 15 segundos
3. **No hay código que "envíe"**: Solo hay código que "responde"

Es como un servidor web normal: no envías páginas a los usuarios, ellos te las piden.
