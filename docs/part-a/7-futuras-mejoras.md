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
entity.metadataJson = compressed;

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
entity.metadataJson = encrypted;

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

## Resumen de Mejoras por Escenario

| Escenario | Cambios Principales | Costo Adicional | Complejidad |
|-----------|---------------------|-----------------|-------------|
| **Volumen Alto** | Redis, PostgreSQL, Múltiples workers | $200-400/mes | Alta |
| **Reducción Costos** | Compresión, S3, Retención agresiva | -$80/mes | Media |
| **Seguridad** | API keys, TLS, Encriptación, Rate limiting | $50-150/mes | Media |
| **Compliance** | Eliminación por solicitud, Anonimización | $50/mes + dev | Alta |

---

## Roadmap Sugerido

### Fase 1: MVP (Actual)
- ✅ Buffer en memoria
- ✅ PostgreSQL (implementado)
- ✅ Batching básico
- ✅ Retención 30 días

### Fase 2: Escalabilidad (Volumen Medio)
- ✅ PostgreSQL (ya implementado)
- 🔄 Particionado de tablas
- 🔄 Múltiples workers
- 🔄 Métricas avanzadas

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

