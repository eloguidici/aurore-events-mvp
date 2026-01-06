# 2. Contrato y Flujo Básico

## Ingesta de Eventos

### Endpoint: `POST /events`

**Descripción:**  
Ingesta un nuevo evento al sistema. El evento se valida, enriquece con metadata, y se encola al buffer. La respuesta es inmediata (202 Accepted) sin esperar persistencia.

**Rate Limiting:**
- 1000 requests por minuto por IP/cliente
- Implementado con `@Throttle` decorator

---

### Request

**URL:** `POST /events`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "timestamp": "2024-01-15T10:30:00Z",  // ISO 8601 o Unix epoch
  "service": "auth-service",            // String, max 100 caracteres
  "message": "User logged in",          // String, requerido
  "metadata": {                          // Object opcional
    "userId": "123",
    "ipAddress": "192.168.1.1"
  }
}
```

**Validaciones en el Borde:**
1. ✅ `timestamp`: Debe ser parseable (ISO 8601 o Unix epoch)
2. ✅ `service`: String, máximo 100 caracteres, requerido
3. ✅ `message`: String, requerido, no vacío
4. ✅ `metadata`: Object opcional, si existe debe ser válido JSON
5. ✅ Tamaño total del payload: máximo 1MB

---

### Response

#### ✅ Success (202 Accepted)
```json
{
  "status": "accepted",
  "event_id": "evt_abc12345",
  "queued_at": "2024-01-15T10:30:00.123Z"
}
```

**Significado:**
- Evento aceptado y encolado al buffer
- `event_id`: Identificador único generado
- `queued_at`: Timestamp de cuando se encoló

---

#### ❌ Error: Evento Inválido (400 Bad Request)
```json
{
  "status": "error",
  "message": "Invalid event schema",
  "errorCode": "INVALID_EVENT",
  "errors": [
    {
      "field": "timestamp",
      "constraints": {
        "isParseableTimestamp": "timestamp must be a parseable date (ISO 8601 or Unix epoch)"
      }
    }
  ]
}
```

**Causas comunes:**
- `timestamp` inválido o faltante
- `service` faltante o muy largo
- `message` faltante o vacío
- `metadata` no es un objeto válido
- Payload excede 1MB

**Acción del sistema:**
- Evento **nunca entra al buffer**
- Logged: `"Invalid event rejected at edge"`
- Pipeline continúa normalmente

---

#### ⚠️ Error: Buffer Saturado (429 Too Many Requests)
```json
{
  "status": "rate_limited",
  "message": "Buffer is full. Please retry in a few seconds.",
  "retry_after": 5,
  "errorCode": "BUFFER_SATURATED"
}
```

**Causa:**
- Buffer alcanzó capacidad máxima (10,000 eventos)
- Sistema bajo presión (almacenamiento lento o worker lento)

**Acción del sistema:**
- Lanza `BufferSaturatedException` (excepción personalizada)
- Aplica **backpressure** (rechaza eventos)
- Worker continúa procesando
- Buffer se drena, sistema se recupera
- Logged con `ErrorLogger.logWarning()` para monitoreo

**Recomendación al cliente:**
- Implementar retry con exponential backoff
- Esperar `retry_after` segundos antes de reintentar

---

#### ⚠️ Error: Sistema Bajo Presión (503 Service Unavailable)
```json
{
  "status": "service_unavailable",
  "message": "System under pressure. Please retry later."
}
```

**Causa:**
- Buffer se llenó entre el check y el enqueue (race condition)
- Sistema temporalmente no puede aceptar eventos

**Acción del sistema:**
- Similar a 429, pero indica condición temporal
- Sistema se recupera automáticamente

---

## Consulta de Eventos

### Endpoint: `GET /events`

**Descripción:**  
Consulta eventos por servicio y rango de tiempo con paginación y ordenamiento.

**Rate Limiting:**
- 200 requests por minuto por IP/cliente
- Implementado con `@Throttle` decorator

---

### Request

**URL:** `GET /events`

**Query Parameters:**
```
service=auth-service          // Requerido: nombre del servicio
from=2024-01-15T00:00:00Z    // Requerido: inicio del rango (ISO 8601)
to=2024-01-15T23:59:59Z      // Requerido: fin del rango (ISO 8601)
page=1                        // Opcional: número de página (default: 1)
pageSize=10                   // Opcional: items por página (default: 10, max: 100)
sortField=timestamp           // Opcional: campo para ordenar (timestamp, service, message, ingestedAt, createdAt)
sortOrder=DESC                // Opcional: orden (ASC o DESC, default: DESC)
```

**Ejemplo:**
```
GET /events?service=auth-service&from=2024-01-15T00:00:00Z&to=2024-01-15T23:59:59Z&page=1&pageSize=20&sortField=timestamp&sortOrder=DESC
```

**Validaciones:**
1. ✅ `service`: Requerido, debe existir
2. ✅ `from`: Requerido, debe ser ISO 8601 válido
3. ✅ `to`: Requerido, debe ser ISO 8601 válido
4. ✅ `from < to`: El rango de tiempo debe ser válido
5. ✅ `page`: Entero positivo (default: 1)
6. ✅ `pageSize`: Entre 1 y 100 (default: 10)
7. ✅ `sortField`: Uno de los campos permitidos
8. ✅ `sortOrder`: ASC o DESC (default: DESC)

---

### Response

#### ✅ Success (200 OK)
```json
{
  "page": 1,
  "pageSize": 10,
  "sortField": "timestamp",
  "sortOrder": "DESC",
  "total": 150,
  "items": [
    {
      "id": "uuid-here",
      "timestamp": "2024-01-15T10:30:00Z",
      "service": "auth-service",
      "message": "User logged in successfully",
      "metadata": {
        "userId": "123",
        "ipAddress": "192.168.1.1"
      },
      "ingestedAt": "2024-01-15T10:30:00.123Z",
      "createdAt": "2024-01-15T10:30:00.123Z"
    }
  ]
}
```

**Campos:**
- `page`: Página actual
- `pageSize`: Items por página
- `sortField`: Campo usado para ordenar
- `sortOrder`: Orden aplicado
- `total`: Total de eventos que cumplen el filtro
- `items`: Array de eventos (puede estar vacío)

---

#### ❌ Error: Parámetros Inválidos (400 Bad Request)
```json
{
  "status": "error",
  "message": "Invalid timestamp format"
}
```

**Causas comunes:**
- `from` o `to` no son ISO 8601 válidos
- `from >= to` (rango inválido)
- `service` faltante
- `pageSize` fuera de rango (1-100)

---

#### ❌ Error: Error Interno (500 Internal Server Error)
```json
{
  "status": "error",
  "message": "Internal server error"
}
```

**Causa:**
- Error inesperado en la base de datos o procesamiento

---

## Flujo Completo de Ingesta

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CLIENTE ENVÍA EVENTO                                         │
│    POST /events                                                  │
│    { timestamp, service, message, metadata }                    │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. VALIDACIÓN EN EL BORDE (EventsController)                   │
│    • Schema validation (class-validator)                        │
│    • Tamaño del payload (< 1MB)                                │
│    • Formato de timestamp                                       │
│                                                                 │
│    ¿Es válido?                                                  │
│    NO → 400 Bad Request (evento rechazado)                     │
│    SÍ → Continúa                                                │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. CHECK DE BACKPRESSURE                                        │
│    ¿Buffer lleno?                                               │
│    SÍ → 429 Too Many Requests                                   │
│    NO → Continúa                                                │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. ENRIQUECIMIENTO                                              │
│    • Genera eventId único (evt_xxx)                            │
│    • Agrega ingestedAt (timestamp actual)                       │
│    • Crea EnrichedEvent                                         │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. ENCOLADO AL BUFFER (EventBufferService)                      │
│    • enqueue(enrichedEvent)                                    │
│    • Operación O(1), no bloqueante                              │
│                                                                 │
│    ¿Se encoló?                                                  │
│    NO → 503 Service Unavailable                                │
│    SÍ → Continúa                                                │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. RESPUESTA INMEDIATA                                           │
│    202 Accepted                                                 │
│    { status: "accepted", event_id, queued_at }                 │
│                                                                 │
│    ⚡ Tiempo total: < 5ms                                       │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ (En background, no bloquea)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. WORKER PROCESA (BatchWorkerService)                          │
│    • Cada 1 segundo                                             │
│    • Drena buffer (500 eventos)                                │
│    • Valida profundamente                                       │
│    • Batch insert a PostgreSQL                                 │
│    • Reintentos si falla                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flujo Completo de Consulta

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CLIENTE CONSULTA                                             │
│    GET /events?service=X&from=Y&to=Z&page=1&pageSize=10        │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. VALIDACIÓN DE PARÁMETROS (EventsController)                │
│    • service requerido                                          │
│    • from/to válidos (ISO 8601)                                │
│    • from < to                                                 │
│    • page/pageSize válidos                                      │
│                                                                 │
│    ¿Es válido?                                                  │
│    NO → 400 Bad Request                                        │
│    SÍ → Continúa                                                │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. CONSULTA A BASE DE DATOS (EventsService)                    │
│    SELECT * FROM events                                         │
│    WHERE service = ?                                            │
│      AND timestamp >= ?                                         │
│      AND timestamp <= ?                                         │
│    ORDER BY timestamp DESC                                      │
│    LIMIT ? OFFSET ?                                             │
│                                                                 │
│    ⚡ Usa índice (service, timestamp)                           │
│    ⚡ Latencia: < 100ms                                         │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. RESPUESTA                                                    │
│    200 OK                                                       │
│    { page, pageSize, total, items: [...] }                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Validaciones en el Borde

### ¿Qué se valida en el borde?

1. **Schema básico (DTOs con class-validator):**
   - Campos requeridos presentes
   - Tipos de datos correctos
   - Formatos válidos (timestamp, strings)
   - Decoradores personalizados: `@IsValidTimeRange`, `@IsSortField`, `@IsSortOrder`

2. **Límites:**
   - Tamaño del payload (< 1MB)
   - Longitud de campos (service max 100 chars)
   - Rango de valores (pageSize 1-100)

3. **Formato:**
   - Timestamp parseable (ISO 8601 o Unix epoch)
   - JSON válido
   - Metadata es objeto válido

4. **Type Guards (defense in depth):**
   - Validación adicional con `isNonEmptyString()`, `isPositiveInteger()`
   - Aplicado en `EventsService.ingestEvent()` y `queryEvents()`

### ¿Qué NO se valida en el borde?

1. **Validación profunda:**
   - Se hace en el worker (no bloquea request)
   - Sanitización de datos
   - Validación de negocio compleja

2. **Dependencias externas:**
   - No se consulta base de datos
   - No se valida contra servicios externos

---

## Casos de Uso

### Caso 1: Ingesta Normal
```
Cliente → POST /events → 202 Accepted → Evento en buffer → Worker procesa
```

### Caso 2: Evento Inválido
```
Cliente → POST /events (inválido) → 400 Bad Request → Evento rechazado
```

### Caso 3: Buffer Lleno
```
Cliente → POST /events → 429 Too Many Requests → Cliente reintenta después
```

### Caso 4: Consulta Normal
```
Cliente → GET /events?service=X&from=Y&to=Z → 200 OK → Eventos retornados
```

### Caso 5: Consulta Sin Resultados
```
Cliente → GET /events?service=X&from=Y&to=Z → 200 OK → { total: 0, items: [] }
```

---

## Métricas y Observabilidad

### Endpoint: `GET /metrics`

**Respuesta:**
```json
{
  "status": "healthy",
  "currentSize": 45,
  "capacity": 10000,
  "utilizationPercent": 0.45,
  "totalEnqueued": 1234,
  "totalDropped": 0,
  "dropRate": 0.0,
  "throughput": 123.4,
  "healthStatus": "healthy",
  "uptimeSeconds": 10.0,
  "timeSinceLastEnqueue": 0.5,
  "timeSinceLastDrain": 0.2
}
```

**Campos:**
- `healthStatus`: "healthy" | "warning" | "critical" (basado en utilización y drop rate)
- `dropRate`: Porcentaje de eventos descartados
- `throughput`: Eventos por segundo
- `uptimeSeconds`: Tiempo desde inicio
- `timeSinceLastEnqueue/Drain`: Tiempo desde última operación

**Uso:**
- Monitoreo del estado del buffer
- Detección de saturación
- Métricas de throughput y performance
- Health status para alertas

---

## Health Checks

### `GET /health`
Estado general del servidor

### `GET /live`
Liveness check (servidor corriendo)

### `GET /ready`
Readiness check (servidor listo para recibir requests)

