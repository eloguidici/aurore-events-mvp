# 7. Futuras Mejoras

Este documento describe cómo evolucionaría el sistema si cambian los requisitos de volumen, costos, seguridad o compliance.

---

## Escenario 1: Aumento de Volumen de Eventos

### Situación Actual
- **Throughput:** ~5,000 eventos/segundo
- **Buffer:** 50,000 eventos en memoria
- **Almacenamiento:** PostgreSQL

### Si el Volumen Aumenta a 50,000 eventos/segundo

#### Cambios Necesarios:

**1. Buffer Externo (Redis Streams)**
```typescript
// Reemplazar buffer en memoria por Redis Streams
// Ventajas:
// - Escalable horizontalmente
// - Persistencia automática
// - ACK/retry nativo
// - Múltiples workers pueden consumir

// Implementación:
const redis = new Redis();
await redis.xadd('events:stream', '*', 'event', JSON.stringify(event));
```

**2. Múltiples Workers**
```typescript
// Escalar workers horizontalmente
// - Worker 1: Procesa stream partition 0
// - Worker 2: Procesa stream partition 1
// - Worker N: Procesa stream partition N

// Load balancing automático con Redis Streams
```

**3. Optimización de PostgreSQL**
```typescript
// PostgreSQL ya está implementado, optimizaciones adicionales:
// Ventajas:
// - Mejor concurrencia
// - Replicación
// - Particionado nativo
// - Connection pooling

// Optimizaciones:
// 1. Read replicas para queries
// 2. Particionado por mes/año
// 3. Ajustar pool size según carga
```

**4. Particionado de Tablas**
```sql
-- Particionar por mes para mejorar performance
CREATE TABLE events_2024_01 PARTITION OF events
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Facilita:
-- - Queries más rápidas (menos datos a escanear)
-- - Retención (eliminar partición completa)
-- - Mantenimiento
```

**5. Índices Adicionales**
```sql
-- Si hay nuevas queries frecuentes
CREATE INDEX idx_timestamp ON events(timestamp);
CREATE INDEX idx_ingested_at ON events(ingested_at);
```

**Costo Estimado:**
- Redis: ~$50-100/mes (managed service)
- PostgreSQL: ~$100-200/mes (managed service)
- Workers adicionales: ~$50/mes cada uno

---

## Escenario 2: Reducción de Costos

### Situación Actual
- **Infraestructura:** Servidor único, PostgreSQL (Docker), buffer en memoria

### Si Necesitamos Reducir Costos

#### Optimizaciones:

**1. Compresión de Eventos**
```typescript
// Comprimir metadata antes de almacenar
const compressed = compress(JSON.stringify(event.metadata));
entity.metadata = compressed; // JSONB soporta compresión nativa

// Ahorro: ~50-70% de espacio en disco
```

**2. Almacenamiento en Objetos (S3) para Eventos Antiguos**
```typescript
// Archivar eventos > 7 días a S3
// Mantener solo últimos 7 días en DB
// Consultas recientes: DB (rápido)
// Consultas antiguas: S3 (más lento pero más barato)

// Ahorro: ~80% de costo de almacenamiento
```

**3. Retención Más Agresiva**
```typescript
// Reducir retención de 30 a 7 días
// Ahorro: ~77% de espacio en disco
```

**4. Batch Processing Más Eficiente**
```typescript
// Aumentar tamaño de batch (500 → 1000)
// Reducir frecuencia (1s → 2s)
// Ahorro: Menos operaciones de DB
```

**5. Serverless (Lambda + DynamoDB)**
```typescript
// Migrar a arquitectura serverless
// - Lambda para ingesta
// - DynamoDB para almacenamiento
// - Pay-per-use (solo pagas lo que usas)

// Ahorro: ~60-80% si volumen es variable
```

**Costo Estimado (Reducción):**
- Compresión: $0 (solo código)
- S3 archiving: -$50/mes
- Retención 7 días: -$30/mes
- **Total ahorro: ~$80/mes**

---

## Escenario 3: Requisitos de Seguridad

### Situación Actual
- **Autenticación:** Ninguna
- **Autorización:** Ninguna
- **Encriptación:** Ninguna

### Si Necesitamos Seguridad

#### Mejoras Necesarias:

**1. Autenticación (API Keys)**
```typescript
// Cada cliente tiene API key
@UseGuards(ApiKeyGuard)
@Post('events')
async ingestEvent(@Body() dto: CreateEventDto, @Request() req) {
  const apiKey = req.headers['x-api-key'];
  // Validar API key
  // Rate limiting por API key
}

// Implementación:
// - Tabla de API keys en DB
// - Rate limiting por cliente
// - Rotación de keys
```

**2. Encriptación en Tránsito (TLS)**
```typescript
// HTTPS obligatorio
// Certificados SSL/TLS
// HSTS headers

// Implementación:
app.use(helmet()); // Security headers
// Configurar TLS en servidor
```

**3. Encriptación en Reposo**
```typescript
// Encriptar metadata sensible antes de almacenar
const encrypted = encrypt(JSON.stringify(event.metadata), key);
entity.metadata = encrypted; // JSONB permite almacenar datos encriptados

// Usar KMS para gestión de keys
```

**4. Auditoría y Logging de Seguridad**
```typescript
// Log todas las operaciones
// - Quién hizo qué
// - Cuándo
// - Desde dónde (IP)
// - Resultado (éxito/fallo)

// Implementación:
this.auditLogger.log({
  action: 'event_ingested',
  userId: apiKey.userId,
  ip: req.ip,
  timestamp: new Date(),
});
```

**5. Rate Limiting por Cliente**
```typescript
// Limitar requests por API key
// - 1000 requests/minuto por cliente
// - Sliding window algorithm

// Implementación:
const rateLimiter = new RateLimiter({
  windowMs: 60000, // 1 minuto
  max: 1000, // 1000 requests
});
```

**6. Validación de Input Más Estricta**
```typescript
// Sanitizar input
// - Prevenir injection attacks
// - Validar tamaño máximo
// - Validar tipos estrictamente

// Implementación:
@IsString()
@MaxLength(1000)
@Matches(/^[a-zA-Z0-9\s]+$/) // Solo alfanuméricos
message: string;
```

**Costo Estimado:**
- Certificados SSL: $0-100/año (Let's Encrypt)
- Rate limiting: $0 (código)
- Encriptación: $0-50/mes (KMS)
- **Total: ~$50-150/mes**

---

## Escenario 4: Requisitos de Compliance (GDPR, HIPAA, etc.)

### Situación Actual
- **Retención:** 30 días fijos
- **Datos personales:** Sin manejo especial
- **Eliminación:** Solo por tiempo

### Si Necesitamos Compliance

#### Mejoras Necesarias:

**1. Eliminación por Solicitud (Right to be Forgotten)**
```typescript
// Endpoint para eliminar eventos de un usuario específico
@Delete('events/user/:userId')
async deleteUserEvents(@Param('userId') userId: string) {
  // Eliminar todos los eventos que contengan userId en metadata
  await this.eventsService.deleteByUserId(userId);
  
  // Log para auditoría
  this.auditLogger.log({
    action: 'user_data_deleted',
    userId,
    timestamp: new Date(),
  });
}
```

**2. Anonimización de Datos**
```typescript
// Anonimizar datos personales después de X días
// - Reemplazar userIds con hashes
// - Eliminar IPs
// - Eliminar emails

// Implementación:
async anonymizeOldEvents(days: number) {
  const events = await this.getEventsOlderThan(days);
  for (const event of events) {
    event.metadata = this.anonymizeMetadata(event.metadata);
    await this.save(event);
  }
}
```

**3. Retención Configurable por Tipo de Dato**
```typescript
// Diferentes retenciones según tipo de dato
// - Datos personales: 30 días
// - Logs de sistema: 90 días
// - Métricas: 1 año

// Implementación:
const retentionPolicy = {
  'personal_data': 30,
  'system_logs': 90,
  'metrics': 365,
};

await this.deleteByRetentionPolicy(event.service, retentionPolicy);
```

**4. Exportación de Datos (Data Portability)**
```typescript
// Endpoint para exportar datos de un usuario
@Get('events/user/:userId/export')
async exportUserEvents(@Param('userId') userId: string) {
  const events = await this.getEventsByUserId(userId);
  return {
    format: 'json',
    data: events,
    exportedAt: new Date(),
  };
}
```

**5. Logging de Acceso a Datos**
```typescript
// Log todas las consultas que acceden a datos personales
// - Quién consultó
// - Qué datos
// - Cuándo
// - Propósito

// Implementación:
this.auditLogger.log({
  action: 'personal_data_accessed',
  userId: req.user.id,
  dataType: 'events',
  purpose: 'user_export',
  timestamp: new Date(),
});
```

**6. Consentimiento y Opt-out**
```typescript
// Permitir a usuarios opt-out de tracking
// - Flag en metadata
// - No almacenar eventos de usuarios que optaron out

// Implementación:
if (user.hasOptedOut) {
  return { status: 'skipped', reason: 'user_opt_out' };
}
```

**Costo Estimado:**
- Desarrollo: 2-3 semanas
- Infraestructura adicional: ~$50/mes (audit logs)
- **Total: ~$50/mes + desarrollo**

---

## Escenario 5: Observabilidad y Monitoreo Avanzado

### Situación Actual
- **Métricas básicas:** `/health`, `/metrics`, `/health/buffer`, `/health/database`, `/health/business`
- **Logging:** Estructurado con `ErrorLogger`
- **Health checks:** Básicos (liveness, readiness)
- **Métricas de negocio:** Eventos por servicio, tendencias, top servicios

### Si Necesitamos Observabilidad Avanzada

#### Mejoras Necesarias:

**1. Alertas Automáticas (Prometheus + AlertManager)**
```typescript
// Exponer métricas en formato Prometheus
@Get('metrics/prometheus')
async getPrometheusMetrics() {
  return `
# HELP buffer_size Current buffer size
# TYPE buffer_size gauge
buffer_size ${bufferSize}

# HELP buffer_utilization_percent Buffer utilization percentage
# TYPE buffer_utilization_percent gauge
buffer_utilization_percent ${utilizationPercent}

# HELP events_dropped_total Total events dropped
# TYPE events_dropped_total counter
events_dropped_total ${totalDropped}
  `;
}

// Alertas configuradas en Prometheus:
// - buffer_utilization_percent > 90 → Critical
// - events_dropped_total > 100 → Warning
// - database_connection_failures > 5 → Critical
```

**2. Dashboards (Grafana)**
```typescript
// Dashboards pre-configurados:
// - Buffer utilization over time
// - Events throughput (events/second)
// - Drop rate trends
// - Database connection pool usage
// - Circuit breaker state transitions
// - Business metrics (events by service, hourly trends)
// - Error rates by endpoint
```

**3. Distributed Tracing (OpenTelemetry)**
```typescript
// Instrumentar con OpenTelemetry
import { trace } from '@opentelemetry/api';

async ingestEvent(dto: CreateEventDto) {
  const span = trace.getActiveSpan();
  span?.setAttribute('event.service', dto.service);
  span?.setAttribute('event.timestamp', dto.timestamp);
  
  // Trace completo: Request → Validation → Enrichment → Buffer → Worker → DB
  // Permite ver latencia en cada paso
}
```

**4. Log Aggregation (ELK Stack)**
```typescript
// Enviar logs a Elasticsearch
// - Structured logging ya implementado
// - Agregar correlation IDs a todos los logs
// - Indexar por service, timestamp, error level
// - Búsqueda avanzada y análisis de patrones

// Implementación:
this.logger.log({
  correlationId: req.correlationId,
  service: dto.service,
  level: 'info',
  message: 'Event ingested',
  timestamp: new Date().toISOString(),
  metadata: { eventId, bufferSize }
});
```

**5. APM Tools (New Relic, Datadog)**
```typescript
// Integración con APM para:
// - Performance monitoring (latencia por endpoint)
// - Error tracking (errores agrupados por tipo)
// - Database query performance
// - Memory/CPU usage
// - Custom business metrics

// Implementación:
newrelic.recordMetric('Custom/Events/Ingested', eventCount);
newrelic.recordMetric('Custom/Buffer/Utilization', utilizationPercent);
```

**6. Métricas de Negocio Avanzadas**
```typescript
// Agregar métricas adicionales:
// - P95/P99 latencia de ingesta
// - Tasa de éxito/fallo por servicio
// - Tiempo promedio de procesamiento (ingesta → persistencia)
// - Distribución de tamaños de eventos
// - Patrones de uso por hora/día

// Endpoint adicional:
@Get('metrics/advanced')
async getAdvancedMetrics() {
  return {
    latency: {
      p50: 2.5,  // ms
      p95: 5.0,
      p99: 10.0
    },
    processingTime: {
      average: 1.2,  // segundos desde ingesta hasta DB
      max: 3.5
    },
    eventSizeDistribution: {
      small: 0.6,   // < 1KB
      medium: 0.3,  // 1-10KB
      large: 0.1    // > 10KB
    }
  };
}
```

**Costo Estimado:**
- Prometheus (self-hosted): $0-50/mes
- Grafana (self-hosted): $0-30/mes
- ELK Stack (self-hosted): $100-200/mes
- APM (managed): $50-200/mes según volumen
- **Total: ~$50-480/mes** (depende de opciones elegidas)

---

## Escenario 6: Alta Disponibilidad y Resiliencia

### Situación Actual
- **Deployment:** Servidor único
- **Base de datos:** PostgreSQL en Docker (single instance)
- **Recuperación:** Checkpoint en disco local
- **Failover:** Manual

### Si Necesitamos Alta Disponibilidad

#### Mejoras Necesarias:

**1. Multi-Region Deployment**
```typescript
// Desplegar en múltiples regiones:
// - Región 1 (US-East): Primary
// - Región 2 (US-West): Secondary (read-only)
// - Región 3 (EU): Secondary (read-only)

// Load balancing geográfico:
// - Ingesta: Route a región más cercana
// - Queries: Route a read replica más cercana
// - Failover automático si primary falla
```

**2. Database Replication**
```sql
-- PostgreSQL streaming replication
-- Primary: Write operations
-- Replicas: Read operations (read-only)

-- Configuración:
-- 1. Primary DB acepta writes
-- 2. Replicas sincronizadas en tiempo real
-- 3. Failover automático si primary falla
-- 4. Queries distribuidas entre replicas
```

**3. Disaster Recovery**
```typescript
// Estrategia de backup:
// 1. Backups incrementales cada hora
// 2. Backups completos diarios
// 3. Backups almacenados en S3 (multi-region)
// 4. Point-in-time recovery (PITR)
// 5. RTO (Recovery Time Objective): < 1 hora
// 6. RPO (Recovery Point Objective): < 15 minutos

// Implementación:
// - PostgreSQL WAL archiving
// - Backup automatizado con pg_dump
// - Restore testing mensual
```

**4. Health Checks Avanzados**
```typescript
// Health checks más granulares:
@Get('health/readiness')
async readinessCheck() {
  const checks = {
    database: await this.checkDatabase(),
    buffer: this.checkBuffer(),
    diskSpace: await this.checkDiskSpace(),
    memory: this.checkMemory(),
  };
  
  const isReady = Object.values(checks).every(c => c.healthy);
  return { status: isReady ? 'ready' : 'not_ready', checks };
}

// Kubernetes readiness probe:
// - Si no está ready, no recibe tráfico
// - Permite graceful shutdown
```

**5. Circuit Breaker Avanzado**
```typescript
// Circuit breaker con múltiples niveles:
// - L1: Database connection failures
// - L2: Slow queries (> 2 segundos)
// - L3: High error rate (> 10% errors)

// Auto-recovery con exponential backoff
// Health checks periódicos en estado HALF_OPEN
// Métricas de circuit breaker state transitions
```

**6. Graceful Degradation**
```typescript
// Si database falla:
// 1. Continuar aceptando eventos (buffer)
// 2. Almacenar en checkpoint más frecuentemente
// 3. Cuando DB se recupera, procesar backlog
// 4. Notificar a operadores

// Si buffer se llena:
// 1. Aplicar backpressure (429)
// 2. Log eventos rechazados para análisis
// 3. Alertar a operadores
```

**7. Multi-AZ Deployment**
```typescript
// Desplegar en múltiples Availability Zones:
// - AZ-1: Primary application + Primary DB
// - AZ-2: Secondary application + Replica DB
// - Auto-failover entre AZs

// Beneficios:
// - Tolerancia a fallos de AZ
// - Sin downtime en mantenimiento
// - Mejor latencia (AZ más cercana)
```

**Costo Estimado:**
- Multi-region deployment: +$200-400/mes (servidores adicionales)
- Database replication: +$100-200/mes (replicas)
- Backup storage (S3): +$20-50/mes
- Load balancer: +$20-50/mes
- **Total: ~$340-700/mes adicionales**

---

## Resumen de Mejoras por Escenario

| Escenario | Cambios Principales | Costo Adicional | Complejidad |
|-----------|---------------------|-----------------|-------------|
| **Volumen Alto** | Redis, PostgreSQL, Múltiples workers | $200-400/mes | Alta |
| **Reducción Costos** | Compresión, S3, Retención agresiva | -$80/mes | Media |
| **Seguridad** | API keys, TLS, Encriptación, Rate limiting | $50-150/mes | Media |
| **Compliance** | Eliminación por solicitud, Anonimización | $50/mes + dev | Alta |
| **Observabilidad** | Prometheus, Grafana, ELK, APM, Tracing | $50-480/mes | Media |
| **Alta Disponibilidad** | Multi-region, Replicación, DR, Multi-AZ | $340-700/mes | Alta |

---

## Roadmap Sugerido

### Fase 1: MVP (Actual)
- ✅ Buffer en memoria
- ✅ PostgreSQL (implementado)
- ✅ Batching básico
- ✅ Retención 30 días

### Fase 2: Escalabilidad (Volumen Medio)
- ✅ PostgreSQL (ya implementado)
- ✅ Métricas básicas (ya implementadas: `/health`, `/metrics`, `/health/business`)
- 🔄 Particionado de tablas
- 🔄 Múltiples workers
- 🔄 Métricas avanzadas (P95/P99, distribución de tamaños)

### Fase 3: Escalabilidad Alta (Volumen Alto)
- 🔄 Redis Streams
- 🔄 Load balancing
- 🔄 Replicación de DB
- 🔄 Auto-scaling

### Fase 4: Seguridad
- 🔄 API keys
- 🔄 Rate limiting
- 🔄 Encriptación
- 🔄 Auditoría

### Fase 5: Compliance
- 🔄 Eliminación por solicitud
- 🔄 Anonimización
- 🔄 Exportación de datos
- 🔄 Logging de acceso

### Fase 6: Observabilidad Avanzada
- 🔄 Alertas automáticas (Prometheus + AlertManager)
- 🔄 Dashboards (Grafana)
- 🔄 Distributed tracing (OpenTelemetry)
- 🔄 Log aggregation (ELK Stack)
- 🔄 APM tools (New Relic, Datadog)
- 🔄 Métricas avanzadas (P95/P99, processing time)

### Fase 7: Alta Disponibilidad
- 🔄 Multi-region deployment
- 🔄 Database replication
- 🔄 Disaster recovery (backups automatizados)
- 🔄 Health checks avanzados
- 🔄 Multi-AZ deployment
- 🔄 Graceful degradation

---

## Principios para Futuras Mejoras

1. **Medir Primero:** No optimizar sin métricas
2. **Iterar:** Mejoras incrementales, no big bang
3. **Migrabilidad:** Diseño permite migración gradual
4. **Costo-Beneficio:** Evaluar costo vs beneficio real
5. **Simplicidad:** Elegir la solución más simple que funcione

---

## Conclusión

El MVP está diseñado para ser **escalable desde el inicio**. Las decisiones actuales (PostgreSQL, buffer en memoria) son **suficientes para MVP** y permiten escalar según necesidades futuras.

**Clave:** El sistema evoluciona según necesidades reales, no anticipando problemas que pueden no ocurrir.

