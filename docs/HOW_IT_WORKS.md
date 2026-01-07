# ¿Cómo Funciona el Sistema? - Explicación Completa

## 🎯 Visión General

El sistema tiene **dos caminos separados**:

1. **Camino Rápido (Request Path)**: Recibe eventos y los encola → respuesta inmediata
2. **Camino de Persistencia (Worker)**: Procesa eventos en lotes y los guarda en la base de datos

Esto permite **alta velocidad** en la ingesta sin bloquear el sistema.

---

## 📥 PASO 1: Llega un Evento (POST /events)

### Ejemplo de Request:
```bash
POST http://localhost:3000/events
Content-Type: application/json

{
  "timestamp": "2024-01-15T10:30:00Z",
  "service": "auth-service",
  "message": "User login successful",
  "metadata": {
    "user_id": "12345"
  }
}
```

### ¿Qué pasa en el código?

**Archivo:** `src/events/events.controller.ts` - método `ingestEvent()`

```typescript
@Post('events')
async ingestEvent(@Body() createEventDto: CreateEventDto) {
  // 1. VALIDACIÓN AUTOMÁTICA (NestJS ValidationPipe)
  //    Si el evento es inválido → 400 Bad Request (NUNCA entra al buffer)
  
  // 2. VERIFICAR SI EL BUFFER ESTÁ LLENO
  if (this.eventBufferService.isFull()) {
    return 429 Too Many Requests  // Backpressure
  }
  
  // 3. ENRIQUECER EL EVENTO (agregar ID y timestamp de ingesta)
  const enrichedEvent = {
    eventId: "evt_abc123",
    timestamp: "2024-01-15T10:30:00Z",
    service: "auth-service",
    message: "User login successful",
    metadata: {...},
    ingestedAt: "2024-01-15T10:30:00.123Z"
  }
  
  // 4. ENCOLAR EN EL BUFFER (operación O(1), no bloquea)
  this.eventBufferService.enqueue(enrichedEvent);
  
  // 5. RESPONDER INMEDIATAMENTE (202 Accepted)
  return {
    status: "accepted",
    event_id: "evt_abc123",
    queued_at: "2024-01-15T10:30:00.123Z"
  }
}
```

**Tiempo total:** < 5 milisegundos ⚡

---

## ✅ PASO 2: Validación en el Borde

### ¿Qué se valida?

**Archivo:** `src/events/dto/create-event.dto.ts`

```typescript
export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @IsParseableTimestamp()  // Debe ser fecha válida (ISO o epoch)
  timestamp: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)  // Máximo 100 caracteres
  service: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)  // Máximo 2000 caracteres
  message: string;

  @IsOptional()
  @IsObject()
  @IsMetadataSizeValid()  // Máximo 16KB cuando se stringifica
  metadata?: Record<string, any>;
}
```

### Si el evento es inválido:

```json
// Respuesta 400 Bad Request
{
  "status": "error",
  "message": "Invalid event schema",
  "errorCode": "INVALID_EVENT",
  "errors": [
    {
      "field": "timestamp",
      "constraints": {
        "isParseableTimestamp": "timestamp must be a parseable date"
      }
    }
  ]
}
```

**Importante:** El evento **NUNCA entra al buffer**. Se rechaza en el borde.

---

## 📦 PASO 3: Buffer en Memoria

### ¿Qué es el buffer?

**Archivo:** `src/events/services/event-buffer.service.ts`

```typescript
export class EventBufferService {
  private buffer: EnrichedEvent[] = [];  // Array en memoria
  private maxSize = 10000;  // Capacidad máxima (configurable)
  
  enqueue(event: EnrichedEvent): boolean {
    if (this.buffer.length >= this.maxSize) {
      return false;  // Buffer lleno
    }
    
    this.buffer.push(event);  // Agregar al final (O(1))
    return true;
  }
  
  drainBatch(batchSize: number): EnrichedEvent[] {
    // Sacar hasta 'batchSize' eventos del inicio
    const batch = [];
    for (let i = 0; i < batchSize && this.buffer.length > 0; i++) {
      batch.push(this.buffer.shift());  // FIFO (First In, First Out)
    }
    return batch;
  }
}
```

### Visualización:

```
Buffer (Array en memoria):
┌─────────────────────────────────────┐
│ [event1] [event2] [event3] ...      │  ← Eventos esperando
│                                     │
│ Capacidad: 10,000 eventos          │
│ Actual: 1,250 eventos              │
│ Utilización: 12.5%                 │
└─────────────────────────────────────┘
```

### ¿Qué pasa si el buffer se llena?

```typescript
if (this.eventBufferService.isFull()) {
  // Respuesta 429 Too Many Requests
  throw new HttpException({
    status: 'rate_limited',
    message: 'Buffer is full. Please retry in a few seconds.',
    retry_after: 5,
    errorCode: 'BUFFER_SATURATED'
  }, 429);
}
```

Esto es **backpressure**: el sistema se protege rechazando eventos cuando está saturado.

---

## ⚙️ PASO 4: Worker de Procesamiento por Lotes

### ¿Cómo funciona el worker?

**Archivo:** `src/batch-worker/batch-worker.service.ts`

El worker se ejecuta **cada 1 segundo** (configurable) y hace lo siguiente:

```typescript
// Se ejecuta automáticamente cada 1 segundo
private async processBatch() {
  // 1. DRENAR EL BUFFER (sacar hasta 500 eventos)
  const batch = this.eventBufferService.drainBatch(500);
  
  if (batch.length === 0) {
    return;  // Buffer vacío, no hay nada que hacer
  }
  
  // 2. VALIDAR EVENTOS (validación profunda)
  const { validEvents, invalidEvents } = this.validateBatch(batch);
  
  // 3. INSERTAR A LA BASE DE DATOS (lote completo)
  if (validEvents.length > 0) {
    const { successful, failed } = await this.eventsService.batchInsert(validEvents);
    
    // 4. REINTENTAR EVENTOS FALLIDOS (con exponential backoff)
    if (failed > 0) {
      this.retryFailedEvents(failedEvents);
    }
  }
}
```

### Visualización del Proceso:

```
Cada 1 segundo:
┌─────────────────────────────────────────┐
│ Worker despierta                         │
│   ↓                                      │
│ Drena buffer: [500 eventos]              │
│   ↓                                      │
│ Valida: 495 válidos, 5 inválidos        │
│   ↓                                      │
│ Inserta en DB: 495 eventos               │
│   ↓                                      │
│ Si fallan: Reintenta con backoff        │
└─────────────────────────────────────────┘
```

---

## 💾 PASO 5: Persistencia en Base de Datos

### ¿Cómo se guardan los eventos?

**Archivo:** `src/events/services/events.service.ts`

```typescript
async batchInsert(events: CreateEventDto[]) {
  try {
    // TRANSACCIÓN ATÓMICA (todo o nada)
    await this.eventRepository.manager.transaction(async (manager) => {
      // Convertir DTOs a entidades
      // TypeORM maneja automáticamente la serialización de JSONB
      const eventEntities = events.map(event => {
        const entity = new Event();
        entity.eventId = event.eventId; // ID único generado por el sistema
        entity.timestamp = event.timestamp; // ISO 8601 UTC
        entity.service = event.service;
        entity.message = event.message;
        entity.metadata = event.metadata || null; // JSONB - TypeORM serializa automáticamente
        entity.ingestedAt = event.ingestedAt; // ISO 8601 UTC
        return entity;
      });
      
      // INSERTAR EN LOTE (mucho más rápido que uno por uno)
      await manager.save(Event, eventEntities);
    });
    
    return { successful: events.length, failed: 0 };
  } catch (error) {
    // Si falla, todos los eventos del batch fallan
    return { successful: 0, failed: events.length };
  }
}
```

### Estructura de la Tabla:

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  event_id VARCHAR(20) UNIQUE NOT NULL,
  timestamp TEXT NOT NULL,  -- ISO 8601 format in UTC (e.g., '2024-01-15T10:30:00.000Z')
  service VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,  -- Native PostgreSQL JSONB type (enables JSON queries)
  ingested_at TEXT NOT NULL,  -- ISO 8601 format in UTC
  created_at TIMESTAMPTZ DEFAULT now()  -- UTC timestamp with time zone
);

-- Índices para optimizar consultas
CREATE INDEX idx_events_service_timestamp ON events (service, timestamp);
CREATE INDEX idx_events_service_created_at ON events (service, created_at);
CREATE INDEX idx_events_timestamp ON events (timestamp);
CREATE INDEX idx_events_created_at ON events (created_at);
CREATE INDEX idx_events_event_id ON events (event_id);
CREATE INDEX idx_events_metadata_gin ON events USING GIN (metadata);  -- GIN index for JSONB queries
```

**Notas importantes:**
- **Timezone**: Todas las fechas se almacenan en UTC. PostgreSQL está configurado con `timezone: 'UTC'` y el contenedor Docker usa `TZ=UTC`.
- **Metadata JSONB**: Usa el tipo JSONB nativo de PostgreSQL que permite:
  - Consultas JSON nativas: `WHERE metadata->>'userId' = '123'`
  - Índices GIN para búsquedas eficientes en JSON
  - Validación automática de JSON
  - Mejor rendimiento que almacenar JSON como texto

-- Índice compuesto para consultas rápidas
CREATE INDEX idx_service_timestamp ON events(service, timestamp);
```

**¿Por qué batch insert?**
- 500 inserts individuales: ~5 segundos
- 1 batch insert de 500: ~50 milisegundos
- **100x más rápido** 🚀

---

## 🔄 PASO 6: Manejo de Errores y Reintentos

### ¿Qué pasa si la base de datos falla?

**Escenario:** La base de datos está lenta o no responde.

```typescript
// Intento 1: Falla
await this.eventsService.batchInsert(events);  // ❌ Error

// Esperar 100ms (exponential backoff)
await sleep(100);

// Intento 2: Falla
await this.eventsService.batchInsert(events);  // ❌ Error

// Esperar 200ms
await sleep(200);

// Intento 3: Falla
await this.eventsService.batchInsert(events);  // ❌ Error

// Esperar 400ms
await sleep(400);

// Intento 4: Éxito ✅
await this.eventsService.batchInsert(events);  // ✅ Success
```

### Exponential Backoff:

```
Intento 1: Esperar 100ms  (2^0 * 100)
Intento 2: Esperar 200ms  (2^1 * 100)
Intento 3: Esperar 400ms  (2^2 * 100)
Intento 4: Esperar 800ms (2^3 * 100)
Intento 5: Esperar 1600ms (2^4 * 100)
...
Máximo: 5000ms (5 segundos)
```

### Si todos los reintentos fallan:

```typescript
// Evento permanentemente fallido
this.logger.error(
  `Event ${event.eventId} permanently failed after 3 retries`,
  { eventId, service, timestamp }
);
// Se guarda en dead-letter log (no crashea el sistema)
```

**Importante:** El worker **nunca se detiene**. Continúa procesando el siguiente batch.

---

## 🔍 PASO 7: Consulta de Eventos (GET /events)

### Ejemplo de Query:

```bash
GET /events?service=auth-service&from=2024-01-15T00:00:00Z&to=2024-01-15T23:59:59Z&limit=50&offset=0
```

### ¿Cómo funciona?

**Archivo:** `src/events/services/events.service.ts` - método `queryEvents()`

```typescript
async queryEvents(queryDto: QueryEventsDto) {
  const { service, from, to, limit = 100, offset = 0 } = queryDto;
  
  // 1. CONTAR TOTAL (para paginación)
  const total = await this.eventRepository
    .createQueryBuilder('event')
    .where('event.service = :service', { service })
    .andWhere('event.timestamp >= :from', { from })
    .andWhere('event.timestamp <= :to', { to })
    .getCount();
  
  // 2. CONSULTAR CON PAGINACIÓN (usando índice compuesto)
  const events = await this.eventRepository
    .createQueryBuilder('event')
    .where('event.service = :service', { service })
    .andWhere('event.timestamp >= :from', { from })
    .andWhere('event.timestamp <= :to', { to })
    .orderBy('event.timestamp', 'DESC')
    .limit(limit)
    .offset(offset)
    .getMany();
  
  return { events, total, limit, offset, hasMore: offset + limit < total };
}
```

### Respuesta:

```json
{
  "events": [
    {
      "id": "evt_abc123",
      "timestamp": "2024-01-15T10:30:00Z",
      "service": "auth-service",
      "message": "User login successful",
      "metadata": { "user_id": "12345" }
    }
  ],
  "pagination": {
    "total": 1250,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

**Tiempo de consulta:** < 100ms (gracias al índice compuesto)

---

## 🧹 PASO 8: Limpieza Automática (Retention)

### ¿Cómo funciona?

**Archivo:** `src/retention/retention.service.ts`

```typescript
@Cron('0 2 * * *')  // Todos los días a las 2 AM
async handleCleanup() {
  // Eliminar eventos más antiguos que 30 días
  const deletedCount = await this.eventsService.deleteOldEvents(30);
  this.logger.log(`Deleted ${deletedCount} old events`);
}
```

### Proceso:

```sql
-- Calcular fecha de corte (30 días atrás)
DELETE FROM events 
WHERE timestamp < '2023-12-16T00:00:00Z';
```

**Se ejecuta automáticamente** todos los días a las 2 AM. No requiere intervención manual.

---

## 📊 Flujo Completo Visual

```
┌─────────────────────────────────────────────────────────────┐
│                   1. REQUEST PATH (Rápido)                   │
│                                                              │
│  Cliente → POST /events                                      │
│     ↓                                                        │
│  Validación (schema, tamaño)                                 │
│     ↓ (si inválido → 400 Bad Request)                       │
│  Verificar buffer (si lleno → 429 Too Many Requests)        │
│     ↓                                                        │
│  Encolar en buffer (O(1))                                   │
│     ↓                                                        │
│  Responder 202 Accepted (< 5ms)                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│             2. BACKGROUND WORKER (Resiliente)                │
│                                                              │
│  Cada 1 segundo:                                             │
│     ↓                                                        │
│  Drenar buffer (500 eventos)                                │
│     ↓                                                        │
│  Validación profunda                                         │
│     ↓                                                        │
│  Batch insert a DB (transacción)                            │
│     ↓                                                        │
│  Si falla: Reintentar con exponential backoff               │
│     ↓                                                        │
│  Si falla permanentemente: Dead-letter log                  │
│     ↓                                                        │
│  Continuar con siguiente batch (nunca crashea)             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   3. CONSULTA (Rápida)                       │
│                                                              │
│  Cliente → GET /events?service=X&from=Y&to=Z                │
│     ↓                                                        │
│  Query con índice (service, timestamp)                     │
│     ↓                                                        │
│  Paginación (limit, offset)                                 │
│     ↓                                                        │
│  Responder con eventos (< 100ms)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Puntos Clave del Diseño

### 1. **Request Path Liviano**
- ✅ No hay I/O bloqueante (no se escribe a DB)
- ✅ Validación mínima y rápida
- ✅ Respuesta en < 5ms

### 2. **Separación de Responsabilidades**
- ✅ Request path: Recibir y encolar
- ✅ Worker: Procesar y persistir
- ✅ Nunca se mezclan

### 3. **Resiliencia**
- ✅ Eventos inválidos: Rechazados en el borde (400)
- ✅ Buffer lleno: Backpressure (429/503)
- ✅ DB lenta/fallando: Exponential backoff + dead-letter
- ✅ Sistema nunca crashea

### 4. **Alto Rendimiento**
- ✅ Batch inserts (100x más rápido)
- ✅ Índices compuestos (consultas rápidas)
- ✅ Buffer en memoria (O(1) append)

---

## 📈 Métricas y Monitoreo

### Health Check Global: `GET /health`

```json
{
  "message": "SERVER_IS_READY"
}
```

### Health Checks Específicos: `GET /health/*`

#### Buffer: `GET /health/buffer`
```json
{
  "status": "healthy",
  "buffer": {
    "size": 1250,
    "capacity": 10000,
    "utilization_percent": "12.50"
  },
  "metrics": {
    "total_enqueued": 50000,
    "total_dropped": 0,
    "drop_rate_percent": "0.00",
    "throughput_events_per_second": 83.33
  }
}
```

#### Database: `GET /health/database`
```json
{
  "status": "healthy",
  "database": "connected",
  "circuitBreaker": {
    "state": "CLOSED",
    "failures": 0,
    "successes": 1000,
    "lastFailureTime": null
  }
}
```

#### Business Metrics: `GET /health/business`
```json
{
  "totalEvents": 123456,
  "eventsByService": {
    "user-service": 50000,
    "auth-service": 30000,
    "payment-service": 20000
  },
  "eventsLast24Hours": 5000,
  "eventsLastHour": 250,
  "averageEventsPerMinute": 3.47,
  "topServices": [
    { "service": "user-service", "count": 50000 },
    { "service": "auth-service", "count": 30000 }
  ],
  "eventsByHour": [
    { "hour": "2024-01-15 10:00", "count": 150 },
    { "hour": "2024-01-15 11:00", "count": 200 }
  ]
}
```

#### Detailed Health: `GET /health/detailed`
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "server": { "status": "ready", "message": "SERVER_IS_READY" },
  "database": { "status": "healthy", "database": "connected" },
  "buffer": { "status": "healthy", "buffer": {...} },
  "circuitBreaker": { "state": "CLOSED", ... },
  "business": { "totalEvents": 123456, ... }
}
```

### Métricas del Buffer: `GET /metrics`

```json
{
  "status": "healthy",
  "buffer_size": 1250,
  "buffer_capacity": 10000,
  "buffer_utilization_percent": "12.50",
  "metrics": {
    "total_enqueued": 50000,
    "total_dropped": 0,
    "drop_rate_percent": "0.00",
    "throughput_events_per_second": 83.33
  },
  "last_enqueue_time": "2024-01-15T10:30:00.123Z",
  "last_drain_time": "2024-01-15T10:29:55.456Z",
  "uptime_seconds": 3600
}
```

Esto te permite monitorear:
- Cuántos eventos están esperando en el buffer
- Si el buffer se está llenando (riesgo de backpressure)
- Cuántos eventos se han procesado
- Estado detallado del buffer y métricas de rendimiento
- Estado del circuit breaker
- Métricas de negocio (eventos por servicio, tendencias)

---

## 🔧 Configuración

Todo es configurable via variables de entorno (todas son REQUERIDAS):

```env
# Server
PORT=3000
HOST=localhost
NODE_ENV=development

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=admin
DB_PASSWORD=admin
DB_DATABASE=aurore_events
DB_SYNCHRONIZE=true
DB_LOGGING=false
DB_POOL_MAX=20

# Buffer
BUFFER_MAX_SIZE=50000      # Capacidad del buffer
CHECKPOINT_INTERVAL_MS=5000

# Batch Worker
BATCH_SIZE=5000            # Eventos por batch
DRAIN_INTERVAL=1000        # Intervalo de procesamiento (ms)
MAX_RETRIES=3              # Reintentos máximos

# Retention
RETENTION_DAYS=30          # Días de retención
RETENTION_CRON_SCHEDULE=0 2 * * *

# Rate Limiting
THROTTLE_TTL_MS=60000
THROTTLE_GLOBAL_LIMIT=300000
THROTTLE_IP_LIMIT=10000
THROTTLE_QUERY_LIMIT=200
THROTTLE_HEALTH_LIMIT=60

# Circuit Breaker
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=2
CIRCUIT_BREAKER_TIMEOUT_MS=30000

# Query
DEFAULT_QUERY_LIMIT=100
MAX_QUERY_LIMIT=1000
MAX_QUERY_TIME_RANGE_DAYS=30
```

Ver `env.example` para la lista completa de variables requeridas.

---

## ✅ Resumen

1. **Evento llega** → Validación rápida → Encolado en buffer → Respuesta 202
2. **Worker procesa** → Drena buffer → Valida → Inserta en batch → Reintenta si falla
3. **Consulta** → Usa índice → Respuesta rápida con paginación
4. **Limpieza** → Automática cada día a las 2 AM

**Todo funciona de forma asíncrona, resiliente y sin bloquear el request path.** 🚀

