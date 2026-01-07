# 3. Código - Gestión de Eventos (Núcleo del MVP)

Este documento muestra cómo el MVP gestiona la ingesta de eventos, desde la recepción hasta el almacenamiento, incluyendo el manejo de casos críticos.

---

## Flujo Completo de Ingesta

### 1. Recepción de Eventos (EventsController)

```typescript
/**
 * Endpoint: POST /events
 * Recibe eventos, valida en el borde, enriquece y encola al buffer
 * Respuesta inmediata (202 Accepted) sin esperar persistencia
 */
@Post('events')
@Throttle({
  default: { limit: rateLimitConfig.globalLimit, ttl: rateLimitConfig.ttlMs },
}) // Rate limiting configurable
async ingestEvent(@Body() createEventDto: CreateEventDto): Promise<IngestEventResponseDto> {
  try {
    // Delega a EventsService (separación de responsabilidades)
    return this.eventsService.ingestEvent(createEventDto);
  } catch (error) {
    // Manejo de errores estandarizado
    if (error instanceof HttpException) {
      // Excepciones personalizadas (BufferSaturatedException, etc.)
      if (error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        ErrorLogger.logWarning(
          this.logger,
          'Buffer is full, rejecting event (backpressure)',
          { service: createEventDto.service },
        );
      }
      throw error;
    }
    // Error inesperado → log y convertir a HttpException
    ErrorLogger.logError(
      this.logger,
      'Unexpected error ingesting event',
      error,
      ErrorLogger.createContext(undefined, createEventDto.service),
    );
    throw new HttpException(
      { status: 'error', message: 'Failed to ingest event', errorCode: 'INGESTION_ERROR' },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

// EventsService.ingestEvent() - Lógica de negocio
ingestEvent(createEventDto: CreateEventDto): IngestEventResponseDto {
  // 1. VALIDACIÓN DE TIPOS (defense in depth)
  if (!isNonEmptyString(createEventDto.service)) {
    throw new Error('Service must be a non-empty string');
  }
  if (!isNonEmptyString(createEventDto.message)) {
    throw new Error('Message must be a non-empty string');
  }

  // 2. ENRIQUECIMIENTO (agregar metadata)
  // Genera eventId con crypto.randomBytes (más eficiente que UUID)
  const enrichedEvent: EnrichedEvent = {
    eventId: `evt_${randomBytes(6).toString('hex')}`, // 12 hex chars
    timestamp: createEventDto.timestamp,
    service: createEventDto.service,
    message: createEventDto.message,
    metadata: createEventDto.metadata,
    ingestedAt: new Date().toISOString(),
  };

  // 3. ENCOLADO ATÓMICO (elimina race condition)
  const enqueued = this.eventBufferService.enqueue(enrichedEvent);

  if (!enqueued) {
    // Buffer lleno → Excepción personalizada
    throw new BufferSaturatedException(envs.retryAfterSeconds);
  }

  // 4. RESPUESTA INMEDIATA
  return new IngestEventResponseDto({
    eventId: enrichedEvent.eventId,
    queuedAt: enrichedEvent.ingestedAt,
  });
  // ⚡ Tiempo total: < 5ms
}
```

**Puntos clave:**
- ✅ Validación en el borde (class-validator antes de llegar aquí)
- ✅ Backpressure explícito (429 si buffer lleno)
- ✅ Enriquecimiento con metadata (eventId, ingestedAt)
- ✅ Respuesta inmediata (no bloquea en almacenamiento)

---

### 2. Validación Básica del Payload

**Validación en el borde (DTO + class-validator):**

```typescript
// CreateEventDto con validaciones
export class CreateEventDto {
  @IsNotEmpty()
  @IsString()
  @IsParseableTimestamp() // Custom validator
  timestamp: string; // ISO 8601 o Unix epoch

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  service: string;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

// Si la validación falla, NestJS automáticamente retorna:
// 400 Bad Request con detalles del error
// El evento NUNCA entra al buffer
```

**Validación profunda (en el worker) - Optimizada:**

```typescript
/**
 * Validación profunda en BatchWorkerService
 * Optimizada: sincrónica para batches pequeños, chunked para grandes
 */
private async validateBatch(batch: EnrichedEvent[]): Promise<BatchValidationResult> {
  const LARGE_BATCH_THRESHOLD = 1000;
  const CHUNK_SIZE = 1000;  // Configurable via BATCH_CHUNK_SIZE (default: 1000)

  if (batch.length < LARGE_BATCH_THRESHOLD) {
    // Batch pequeño: validación sincrónica (muy rápida, no bloquea)
    const validEvents: EnrichedEvent[] = [];
    const invalidEvents: EnrichedEvent[] = [];

    for (const event of batch) {
      if (this.validateEvent(event)) {
        validEvents.push(event);
      } else {
        invalidEvents.push(event);
      }
    }

    return { validEvents, invalidEvents };
  }

  // Batch grande: procesar en chunks con yield points
  const validEvents: EnrichedEvent[] = [];
  const invalidEvents: EnrichedEvent[] = [];

  for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
    const chunk = batch.slice(i, i + CHUNK_SIZE);

    // Procesar chunk sincrónicamente
    for (const event of chunk) {
      if (this.validateEvent(event)) {
        validEvents.push(event);
      } else {
        invalidEvents.push(event);
      }
    }

    // Yield al event loop entre chunks (excepto último)
    if (i + CHUNK_SIZE < batch.length) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return { validEvents, invalidEvents };
}

private validateEvent(event: EnrichedEvent): boolean {
  try {
    // Validación igual que antes, pero usando envs para límites
    if (!event.timestamp || !event.service || !event.message) {
      return false;
    }

    const timestamp = new Date(event.timestamp);
    if (isNaN(timestamp.getTime())) {
      return false;
    }

    if (
      typeof event.service !== 'string' ||
      event.service.length === 0 ||
      event.service.length > envs.serviceNameMaxLength
    ) {
      return false;
    }

    if (typeof event.message !== 'string' || event.message.length === 0) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}
```

**Diferencia clave:**
- **Borde:** Rechaza inmediatamente (400), no entra al sistema
- **Worker:** Filtra eventos corruptos que pasaron el borde, los descarta sin romper el pipeline

---

### 3. Buffering y Batching

#### Buffer en Memoria (EventBufferService) - Optimizado

```typescript
/**
 * Buffer thread-safe en memoria con optimizaciones
 * Capacidad: 50,000 eventos por defecto (configurable via BUFFER_MAX_SIZE)
 * Usa bufferHead para evitar O(n) shift() operations
 */
export class EventBufferService {
  private readonly buffer: EnrichedEvent[] = [];
  private bufferHead = 0; // Índice del primer elemento (para drenado eficiente)
  private readonly maxSize: number = 50000; // Configurable via env
  private readonly metrics = {
    totalEnqueued: 0,
    totalDropped: 0,
    startTime: Date.now(),
    lastEnqueueTime: 0,
    lastDrainTime: 0,
  };

  /**
   * Encolar evento (operación O(1), no bloqueante)
   */
  enqueue(event: EnrichedEvent): boolean {
    // Usa getSize() que considera bufferHead (eventos ya drenados)
    if (this.getSize() >= this.maxSize) {
      this.metrics.totalDropped++;
      return false; // Buffer lleno
    }

    // Append al final (O(1))
    this.buffer.push(event);
    this.metrics.totalEnqueued++;
    this.metrics.lastEnqueueTime = Date.now();
    return true;
  }

  /**
   * Drenar batch del buffer (O(n) una vez, no por elemento)
   * Usa bufferHead para evitar shift() costoso
   */
  drainBatch(batchSize: number): EnrichedEvent[] {
    const currentSize = this.getSize();
    if (currentSize === 0) {
      return [];
    }

    const count = Math.min(batchSize, currentSize);
    const batch: EnrichedEvent[] = [];

    // Extraer eventos usando índices (O(n) una vez)
    for (let i = 0; i < count; i++) {
      const index = this.bufferHead + i;
      if (index < this.buffer.length) {
        batch.push(this.buffer[index]);
      }
    }

    // Actualizar head (no remover elementos todavía)
    this.bufferHead += count;

    // Compactar periódicamente (cuando head > 50% del array)
    if (this.bufferHead > this.buffer.length / 2) {
      this.buffer.splice(0, this.bufferHead);
      this.bufferHead = 0;
    }

    if (batch.length > 0) {
      this.metrics.lastDrainTime = Date.now();
    }

    return batch;
  }

  /**
   * Obtener tamaño actual (considera bufferHead)
   */
  getSize(): number {
    return this.buffer.length - this.bufferHead;
  }
}
```

**Características:**
- ✅ Operación O(1) para enqueue
- ✅ FIFO (First In, First Out)
- ✅ Thread-safe (single-threaded Node.js)
- ✅ Métricas integradas

#### Batching Strategy

```typescript
/**
 * Worker procesa batches cada 1 segundo (configurable)
 * Tamaño de batch: 5,000 eventos por defecto (configurable via BATCH_SIZE)
 */
export class BatchWorkerService {
  private readonly batchSize: number = 5000; // Configurable via env
  private readonly drainInterval: number = 1000; // Configurable via DRAIN_INTERVAL

  /**
   * Procesa batch cada 1 segundo
   */
  start() {
    setInterval(() => {
      this.processBatch(); // Drena hasta BATCH_SIZE eventos (default: 5,000)
    }, this.drainInterval);
  }

  private async processBatch() {
    // 1. Drenar buffer (hasta BATCH_SIZE eventos, default: 5,000)
    const batch = this.eventBufferService.drainBatch(this.batchSize);

    if (batch.length === 0) {
      return; // Buffer vacío, no hacer nada
    }

    // 2. Validar eventos
    const { validEvents, invalidEvents } = this.validateBatch(batch);

    // 3. Insertar validos en batch
    if (validEvents.length > 0) {
      await this.eventsService.batchInsert(validEvents);
    }

    // 4. Invalidos se descartan (logged)
    if (invalidEvents.length > 0) {
      this.logger.warn(`Dropped ${invalidEvents.length} invalid events`);
    }
  }
}
```

**Estrategia de batching:**
- **Por tamaño:** 5,000 eventos por batch (configurable via `BATCH_SIZE`)
- **Por tiempo:** Cada 1 segundo (configurable via `DRAIN_INTERVAL`)
- **Throughput:** 5,000 eventos/batch × 1 batch/segundo = 5,000 eventos/segundo

---

### 4. Envío a Almacenamiento

```typescript
/**
 * Batch insert a PostgreSQL (transacción atómica con Circuit Breaker)
 * Implementado en TypeOrmEventRepository (Repository Pattern)
 * Nunca se ejecuta en el request path
 */
async batchInsert(events: CreateEventDto[]): Promise<BatchInsertResult> {
  if (events.length === 0) {
    return { successful: 0, failed: 0 };
  }

  // Operación protegida con Circuit Breaker
  const operation = async () => {
    return await this.eventRepository.manager.transaction(async (manager) => {
      let successful = 0;
      let failed = 0;

      const values = events.map((event) => ({
        timestamp: event.timestamp,
        service: event.service,
        message: event.message,
        metadata: event.metadata || null, // JSONB - TypeORM serializa automáticamente
        ingestedAt: new Date().toISOString(),
      }));

      // Insertar en chunks para optimizar rendimiento
      const chunkSize = envs.batchChunkSize;
      for (let i = 0; i < values.length; i += chunkSize) {
        const chunk = values.slice(i, i + chunkSize);
        try {
          await manager
            .createQueryBuilder()
            .insert()
            .into(Event)
            .values(chunk)
            .execute();
          successful += chunk.length;
        } catch (chunkError) {
          // Si cualquier chunk falla, rollback completo
          ErrorLogger.logError(
            this.logger,
            'Failed to insert chunk',
            chunkError,
            { chunkNumber: i / chunkSize + 1, chunkSize: chunk.length },
          );
          throw chunkError; // Rollback transaction
        }
      }

      return { successful, failed };
    });
  };

  try {
    // Ejecutar con Circuit Breaker si está disponible
    if (this.circuitBreaker) {
      return await this.circuitBreaker.execute(operation);
    }
    return await operation();
  } catch (error) {
    // Transaction rolled back - todos los eventos fallan
    ErrorLogger.logError(
      this.logger,
      'Batch insert transaction failed',
      error,
      { eventsCount: events.length },
    );
    return { successful: 0, failed: events.length };
  }
}
```

**Características:**
- ✅ Transacción atómica (todo o nada)
- ✅ Batch insert (5,000 eventos por defecto, configurable via `BATCH_SIZE`)
- ✅ ~10x más rápido que inserts individuales
- ✅ Manejo de errores sin romper el pipeline

---

## Manejo de Casos Críticos

### A) Evento Inválido o Corrupto

**Escenario:** Cliente envía evento con timestamp inválido

```typescript
// 1. VALIDACIÓN EN EL BORDE (antes de encolar)
// CreateEventDto validation falla
@IsParseableTimestamp()
timestamp: string; // ❌ "invalid-date"

// Resultado:
// 400 Bad Request
// {
//   "status": "error",
//   "message": "Invalid event schema",
//   "errors": [
//     {
//       "field": "timestamp",
//       "constraints": {
//         "isParseableTimestamp": "timestamp must be a parseable date"
//       }
//     }
//   ]
// }

// El evento NUNCA entra al buffer
// Pipeline continúa normalmente
```

**Escenario:** Evento corrupto que pasa el borde (raro pero posible)

```typescript
// 2. VALIDACIÓN PROFUNDA EN WORKER
private validateBatch(batch: EnrichedEvent[]) {
  const validEvents: EnrichedEvent[] = [];
  const invalidEvents: EnrichedEvent[] = [];

  for (const event of batch) {
    const isValid = this.validateEvent(event);
    if (isValid) {
      validEvents.push(event);
    } else {
      invalidEvents.push(event); // ❌ Evento corrupto
    }
  }

  // Invalidos se descartan (logged)
  if (invalidEvents.length > 0) {
    this.logger.warn(`Dropped ${invalidEvents.length} invalid events`);
    // Pipeline continúa con eventos válidos
  }

  return { validEvents, invalidEvents };
}
```

**Resultado:**
- ✅ Evento inválido se rechaza en el borde (400)
- ✅ Evento corrupto se filtra en el worker (no rompe pipeline)
- ✅ Sistema nunca se rompe por un evento malo

---

### B) Buffer se Llena

**Escenario:** Sistema bajo presión, buffer alcanza capacidad máxima

```typescript
// 1. CHECK EN ENDPOINT
async ingestEvent(@Body() createEventDto: CreateEventDto) {
  // Check antes de procesar
  if (this.eventBufferService.isFull()) {
    // Buffer lleno → Backpressure
    throw new HttpException(
      {
        status: 'rate_limited',
        message: 'Buffer is full. Please retry in a few seconds.',
        retry_after: 5,
        errorCode: 'BUFFER_SATURATED',
      },
      HttpStatus.TOO_MANY_REQUESTS, // 429
    );
  }

  // ... resto del código
}
```

**Flujo completo:**

```
T=0.0s:  Buffer: 49,500 eventos
T=0.1s:  Llegan 600 eventos → Buffer: 50,000 (LLENO)
T=0.2s:  POST /events → 429 Too Many Requests
T=0.3s:  Worker procesa batch (5,000 eventos) → Buffer: 45,500
T=0.4s:  POST /events → 202 Accepted (buffer tiene espacio)
```

**Mecanismos:**
- ✅ Backpressure explícito (429 con retry_after)
- ✅ Worker continúa procesando (buffer se drena)
- ✅ Sistema se recupera automáticamente
- ✅ Métricas disponibles (`/metrics`)

---

### C) Sistema Bajo Presión (Almacenamiento Lento)

**Escenario:** Base de datos se vuelve lenta (2 segundos por batch en vez de 50ms)

```typescript
/**
 * Worker con reintentos y exponential backoff
 */
private async processBatch() {
  const batch = this.eventBufferService.drainBatch(this.batchSize);

  if (batch.length === 0) {
    return;
  }

  // Intentar insertar
  const { successful, failed } = await this.eventsService.batchInsert(batch);

  if (failed > 0) {
    // Eventos fallidos → Reintentar con exponential backoff
    const failedEvents = batch.slice(successful);
    this.retryFailedEvents(failedEvents);
  }
}

/**
 * Reintentos con exponential backoff
 * Fórmula: backoffInitialMs * 2^(retryCount-1)
 * Ejemplo: 100ms, 200ms, 400ms, 800ms... (capped at 5s)
 */
private async retryFailedEvents(failedEvents: EnrichedEvent[]) {
  for (const event of failedEvents) {
    const retryCount = (event.retryCount || 0) + 1;

    if (retryCount < this.maxRetries) {
      // Calcular backoff exponencial
      const backoffMs = this.backoffInitialMs * Math.pow(2, retryCount - 1);
      const delayMs = Math.min(backoffMs, this.backoffMaxMs); // Cap: 5s

      // Esperar antes de reintentar
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Re-encolar para retry
      const retryEvent: EnrichedEvent = {
        ...event,
        retryCount,
      };

      this.eventBufferService.enqueue(retryEvent);
    } else {
      // Permanently failed → Log y continuar
      this.logger.error(
        `Event ${event.eventId} permanently failed after ${this.maxRetries} retries`,
      );
      // Sistema nunca se rompe, continúa procesando otros eventos
    }
  }
}
```

**Flujo bajo presión:**

```
T=0.0s:  Worker intenta insertar batch (5,000 eventos, configurable)
T=0.1s:  DB lenta → Timeout después de 2 segundos
T=2.1s:  Batch falla → Reintentar con backoff (100ms)
T=2.2s:  Reintentar → Timeout otra vez
T=2.3s:  Reintentar con backoff (200ms)
...
T=5.0s:  Si todos los reintentos fallan → Log error, continuar

Efecto en el sistema:
- Worker tarda más en procesar batches
- Buffer crece (se drena más lento)
- Cuando buffer se llena → Backpressure (429)
- Sistema se protege automáticamente
```

**Protecciones:**
- ✅ Reintentos automáticos (exponential backoff)
- ✅ Sistema nunca se rompe (continúa procesando)
- ✅ Backpressure cuando buffer se llena
- ✅ Logging de eventos permanentemente fallidos

---

## Pseudocódigo del Flujo Completo

```
FUNCIÓN ingestEvent(evento):
  // 1. Validación en el borde (automática por NestJS)
  SI evento NO es válido:
    RETORNAR 400 Bad Request
    FIN

  // 2. Check de backpressure
  SI buffer.estáLleno():
    RETORNAR 429 Too Many Requests
    FIN

  // 3. Enriquecimiento
  eventoEnriquecido = {
    ...evento,
    eventId: generarId(),
    ingestedAt: ahora()
  }

  // 4. Encolado
  SI NO buffer.encolar(eventoEnriquecido):
    RETORNAR 503 Service Unavailable
    FIN

  // 5. Respuesta inmediata
  RETORNAR 202 Accepted { event_id, queued_at }
FIN

// En background (worker, cada 1 segundo):
FUNCIÓN processBatch():
  batch = buffer.drenarBatch(5000)  // Configurable via BATCH_SIZE (default: 5000)

  SI batch está vacío:
    RETORNAR
  FIN

  // Validar eventos
  { válidos, inválidos } = validarBatch(batch)

  // Descartar inválidos (logged)
  SI inválidos.length > 0:
    log("Dropped {inválidos.length} invalid events")
  FIN

  // Insertar válidos
  SI válidos.length > 0:
    { exitosos, fallidos } = baseDeDatos.batchInsert(válidos)

    // Reintentar fallidos
    SI fallidos.length > 0:
      reintentarConBackoff(fallidos)
    FIN
  FIN
FIN

FUNCIÓN reintentarConBackoff(eventosFallidos):
  PARA CADA evento EN eventosFallidos:
    intento = evento.retryCount + 1

    SI intento < MAX_RETRIES:
      backoff = calcularBackoffExponencial(intento)
      ESPERAR backoff
      buffer.encolar(evento) // Reintentar
    SINO:
      log("Evento {evento.id} permanentemente fallido")
    FIN
  FIN
FIN
```

---

## Decisiones Clave del Código

### 1. **Validación en Dos Capas**
- **Borde:** Rechaza inmediatamente (400)
- **Worker:** Filtra corruptos que pasaron (no rompe pipeline)

### 2. **Backpressure Explícito**
- Check antes de procesar (429 si buffer lleno)
- Métricas disponibles para monitoreo

### 3. **Batching Eficiente**
- 5,000 eventos por batch (configurable via `BATCH_SIZE`)
- Transacción atómica (todo o nada)
- ~10x más rápido que inserts individuales

### 4. **Reintentos Inteligentes**
- Exponential backoff (100ms → 200ms → 400ms...)
- Cap máximo (5 segundos)
- Sistema nunca se rompe (continúa procesando)

### 5. **No Bloqueo en Request Path**
- Respuesta inmediata (202 Accepted)
- Procesamiento asíncrono en background
- Tiempo total: < 5ms

---

## Métricas y Observabilidad

```typescript
// Endpoint: GET /metrics
getHealth() {
  const metrics = this.eventBufferService.getMetrics();
  return {
    status: 'healthy',
    buffer_size: metrics.currentSize,
    buffer_capacity: metrics.capacity,
    buffer_utilization_percent: metrics.utilizationPercent.toFixed(2),
    metrics: {
      total_enqueued: metrics.totalEnqueued,
      total_dropped: metrics.totalDropped,
    },
  };
}
```

**Uso:**
- Monitoreo del estado del buffer
- Detección de saturación
- Métricas de throughput

---

## Resumen

El código del MVP gestiona eventos de forma:

✅ **Rápida:** < 5ms en request path
✅ **Resiliente:** Maneja eventos inválidos, buffer lleno, almacenamiento lento
✅ **Eficiente:** Batching reduce carga en base de datos
✅ **Observable:** Métricas y logging integrados
✅ **Simple:** Código claro, fácil de mantener
✅ **Consistente:** Manejo de errores uniforme con try-catch en todos los métodos que interactúan con recursos externos

**Principio clave:** Un evento malo nunca rompe todo el sistema.

### Patrón de Manejo de Errores Consistente

Todos los métodos de servicios y repositorios que interactúan con recursos externos (base de datos, archivos, otros servicios) siguen un patrón consistente de manejo de errores:

```typescript
public async methodName(params: Params): Promise<Result> {
  // Extract variables outside try-catch for error logging context
  const { param1, param2 } = params;

  try {
    // Operación principal
    return await this.repository.operation(params);
  } catch (error) {
    // Log error with standardized format and context
    this.errorLogger.logError(
      this.logger,
      'Error description',
      error,
      this.errorLogger.createContext(undefined, service, {
        param1,
        param2,
        // ... contexto adicional
      }),
    );
    // Re-throw to let caller handle it
    throw error;
  }
}
```

**Ejemplos de métodos con este patrón:**
- `EventService.insert()` - Logging contextual con número de eventos y servicios
- `EventService.search()` - Logging contextual con parámetros de búsqueda
- `EventService.cleanup()` - Logging contextual con días de retención
- `EventBufferService.getMetrics()` - Logging contextual con estado del buffer
- Todos los métodos de repositorios (`TypeOrmEventRepository`, `TypeOrmBusinessMetricsRepository`, `FileMetricsRepository`)

**Beneficios:**
- ✅ Logging contextual completo para debugging
- ✅ Trazabilidad de errores en todas las capas
- ✅ Consistencia en el manejo de errores
- ✅ Observabilidad mejorada
- ✅ Facilita debugging y troubleshooting

