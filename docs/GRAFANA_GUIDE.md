# 📊 Guía: Cómo Ver Métricas en Grafana

## 🚀 Paso 1: Acceder a Grafana

1. Abre tu navegador y ve a: **http://localhost:3001**
2. Login con:
   - **Usuario**: `admin`
   - **Password**: `admin`
3. Te pedirá cambiar la contraseña (puedes hacerlo o hacer clic en "Skip")

---

## 📈 Paso 2: Usar el Dashboard Completo

### ✅ Dashboard Pre-configurado Disponible

**¡Buenas noticias!** Ya existe un dashboard completo con todas las métricas pre-configuradas:

1. **Clic en el menú (☰) → Dashboards**
2. **Busca**: "Aurore Events - Complete Dashboard"
3. **Clic en el dashboard** para abrirlo
4. **Verás 21 paneles** con todas las métricas organizadas:
   - Buffer Metrics (6 paneles)
   - Batch Worker Metrics (2 paneles)
   - Business Metrics (2 paneles)
   - Health Metrics (4 paneles)
   - Infrastructure Metrics (2 paneles)
   - Logs (4 paneles)
   - PostgreSQL Queries (1 panel) - Top queries by execution time

**El dashboard se carga automáticamente** cuando Grafana inicia gracias a la configuración de provisioning.

### Opción Alternativa: Crear tu Propio Dashboard

Si quieres crear paneles personalizados:

1. **Clic en el menú (☰) → Dashboards → New Dashboard**
2. **Clic en "Add visualization"**
3. **Selecciona el datasource "Prometheus"** (ya está configurado)
4. **En la query, escribe una métrica**, por ejemplo:
   ```
   buffer_size
   ```
5. **Clic en "Run query"** (botón azul arriba a la derecha)
6. **Verás el gráfico en tiempo real** 🎉

---

## 🎯 Paso 3: Métricas Recomendadas para Empezar

### 1. **Buffer Size** (Tamaño del Buffer)
```
buffer_size
```
- **Qué muestra**: Cuántos eventos hay esperando en el buffer
- **Qué buscar**: Si sube mucho, el buffer se está llenando

### 2. **Events Throughput** (Eventos por Segundo)
```
events_throughput_per_second
```
- **Qué muestra**: Cuántos eventos se procesan por segundo
- **Qué buscar**: Ver el rendimiento del sistema

### 3. **Buffer Utilization** (Utilización del Buffer)
```
buffer_utilization_percent
```
- **Qué muestra**: Porcentaje de uso del buffer (0-100%)
- **Qué buscar**: Si sube > 70% = warning, > 90% = critical

### 4. **Events Enqueued Total** (Total de Eventos Encolados)
```
events_enqueued_total
```
- **Qué muestra**: Contador acumulativo de eventos que entraron
- **Qué buscar**: Ver la tendencia de crecimiento

### 5. **Events Dropped** (Eventos Rechazados)
```
events_dropped_total
```
- **Qué muestra**: Cuántos eventos se rechazaron (buffer lleno)
- **Qué buscar**: Si sube, significa que estás perdiendo eventos

---

## 🎨 Paso 4: Personalizar el Panel

### Cambiar el Tipo de Visualización

1. **En el panel, clic en el dropdown arriba** (dice "Time series" por defecto)
2. **Selecciona otro tipo**:
   - **Time series**: Gráfico de línea (recomendado)
   - **Stat**: Número grande con tendencia
   - **Gauge**: Medidor circular
   - **Table**: Tabla de valores

### Cambiar el Título

1. **Clic en el título del panel** (arriba)
2. **Escribe un nombre descriptivo**, ej: "Buffer Size"

### Cambiar el Intervalo de Tiempo

1. **Arriba a la derecha del dashboard**, clic en el selector de tiempo
2. **Selecciona**:
   - **Last 5 minutes**: Para ver datos recientes
   - **Last 15 minutes**: Para ver más contexto
   - **Last 1 hour**: Para ver tendencias

---

## 📊 Paso 5: Crear un Dashboard Completo

### Panel 1: Buffer Size (Stat)
1. **Add panel → Prometheus**
2. **Query**: `buffer_size`
3. **Visualization**: Selecciona "Stat"
4. **Título**: "Buffer Size"

### Panel 2: Buffer Utilization (Gauge)
1. **Add panel → Prometheus**
2. **Query**: `buffer_utilization_percent`
3. **Visualization**: Selecciona "Gauge"
4. **Título**: "Buffer Utilization %"
5. **En "Standard options" → "Unit"**: Selecciona "Percent (0-100)"

### Panel 3: Events Throughput (Time Series)
1. **Add panel → Prometheus**
2. **Query**: `events_throughput_per_second`
3. **Visualization**: "Time series" (por defecto)
4. **Título**: "Events Throughput (events/sec)"

### Panel 4: Events Enqueued vs Dropped (Time Series)
1. **Add panel → Prometheus**
2. **Query A**: `events_enqueued_total`
   - **Legend**: "Enqueued"
3. **Clic en "+ Query"** para agregar otra query
4. **Query B**: `events_dropped_total`
   - **Legend**: "Dropped"
5. **Título**: "Events: Enqueued vs Dropped"

---

## 🔍 Paso 6: Usar PromQL (Consultas Avanzadas)

### Rate (Tasa de Cambio)
Para ver la tasa de cambio de un contador:
```
rate(events_enqueued_total[1m])
```
- Muestra eventos por segundo (promedio del último minuto)

### Promedio
```
avg(buffer_utilization_percent)
```

### Máximo
```
max(buffer_size)
```

### Suma
```
sum(business_events_by_service)
```

---

## 💡 Tips y Trucos

### 1. **Auto-refresh**
- Arriba a la derecha, clic en el ícono de reloj
- Selecciona "5s" o "10s" para actualización automática

### 2. **Alertas Visuales**
- En el panel, ve a "Alert"
- Configura alertas cuando una métrica supere un umbral
- Ejemplo: Alertar si `buffer_utilization_percent` > 80%

### 3. **Variables (Para Dashboards Dinámicos)**
- En el dashboard, ve a "Settings" → "Variables"
- Crea variables para filtrar por servicio, tiempo, etc.

### 4. **Exportar Dashboard**
- Clic en "Share" (arriba a la derecha)
- Exporta como JSON para compartir o versionar

---

## 🎯 Ejemplo: Dashboard Completo en 5 Minutos

1. **New Dashboard → Add visualization**
2. **Panel 1 (Stat)**: `buffer_size` - Título: "Buffer Size"
3. **Panel 2 (Gauge)**: `buffer_utilization_percent` - Título: "Buffer Utilization"
4. **Panel 3 (Time Series)**: `events_throughput_per_second` - Título: "Throughput"
5. **Panel 4 (Time Series)**: 
   - Query A: `events_enqueued_total` (Legend: "Enqueued")
   - Query B: `events_dropped_total` (Legend: "Dropped")
   - Título: "Events Flow"
6. **Save dashboard** (arriba a la derecha)
7. **Nombre**: "Aurore Events - Overview"

---

## 🆘 Problemas Comunes

### "No data"
- Verifica que la aplicación NestJS esté corriendo
- Verifica que Prometheus esté scrapeando: http://localhost:9090/targets
- Verifica el intervalo de tiempo (últimos 5 minutos)

### "Datasource not found"
- Ve a Configuration → Data Sources
- Verifica que "Prometheus" esté configurado
- URL debería ser: `http://prometheus:9090`

### "Query error"
- Verifica que la métrica exista en: http://localhost:3000/metrics/prometheus
- Verifica la sintaxis de PromQL

---

## 📚 Recursos

- **PromQL Documentation**: https://prometheus.io/docs/prometheus/latest/querying/basics/
- **Grafana Documentation**: https://grafana.com/docs/grafana/latest/
- **Ver todas las métricas**: http://localhost:3000/metrics/prometheus
