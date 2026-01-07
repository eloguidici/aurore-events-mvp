# 1. Arquitectura General del MVP

## Componentes Principales (5)

### 1.1 API de Ingesta (Ingestion API)
**Responsabilidad:**
- Exponer endpoint HTTP `POST /events` para recibir eventos
- Validación ligera en el borde (schema, campos requeridos, formato)
- Rate limiting configurable por tipo de endpoint (global, query, health limits)
- Enriquecimiento de eventos con metadata (eventId generado con crypto.randomBytes)
- Encolado no bloqueante al buffer en memoria
- Aplicar backpressure cuando el buffer está saturado (429/503)
- **Nunca bloquea en operaciones de almacenamiento** (patrón fire-and-forget)

**Características clave:**
- Servidor HTTP stateless (escalable horizontalmente)
- Validación rápida (< 1ms por evento)
- Respuesta inmediata (202 Accepted) con event_id
- Manejo de errores estandarizado con `ErrorLogger`
- Excepciones personalizadas (`BufferSaturatedException`, `ServiceUnavailableException`)
- Rate limiting con `@Throttle` decorator

---

### 1.2 Buffer en Memoria (In-Memory Event Buffer)
**Responsabilidad:**
- Cola thread-safe para absorber picos de ingesta
- Capacidad configurable (50,000 eventos por defecto, configurable via `BUFFER_MAX_SIZE`)
- Operaciones de append rápidas (O(1))
- Operaciones de drenado optimizadas (bufferHead para evitar O(n) shift)
- Proporcionar métricas avanzadas (tamaño, capacidad, utilización, drop rate, throughput, health status)
- Sistema de checkpoint periódico con streaming para recuperación ante crashes

**Características clave:**
- Cola acotada con capacidad configurable
- Operaciones thread-safe (mutex/lock-free)
- Eficiente en memoria (previene crecimiento ilimitado, compactación periódica)
- Checkpoint cada 5 segundos con escritura streaming (evita cargar todo en memoria)
- Métricas avanzadas: drop rate, throughput, time since last enqueue/drain, health status

---

### 1.3 Worker de Procesamiento por Lotes (Batch Worker)
**Responsabilidad:**
- Drenar continuamente el buffer en lotes (5,000 eventos por batch por defecto, configurable via `BATCH_SIZE`)
- Validación profunda optimizada (chunked para batches grandes, sincrónica para pequeños)
- Escritura en lote a la capa de almacenamiento
- Manejo de fallos parciales (reintento solo de items fallidos)
- Reintentos inmediatos (buffer actúa como backoff natural)
- Logging de errores estandarizado con `ErrorLogger` sin detener el pipeline
- Métricas de performance (tiempo de validación, inserción, promedio por batch)

**Características clave:**
- Worker single-threaded (simplicidad)
- Tamaño de batch y intervalo de drenado configurable
- Validación optimizada: sincrónica para < 1000 eventos, chunked para batches grandes
- Reintentos inmediatos (buffer maneja el spacing natural)
- Graceful shutdown con timeout protection (procesa todos los eventos pendientes)
- Métricas de performance integradas

---

### 1.4 Capa de Almacenamiento (Storage Layer - PostgreSQL)
**Responsabilidad:**
- Persistir eventos con columnas indexadas para consultas rápidas
- Soportar consultas por rango de tiempo y servicio
- Manejar escrituras concurrentes del batch worker
- Proporcionar paginación eficiente
- Protección con Circuit Breaker para prevenir cascading failures

**Características clave:**
- **Repository Pattern:** Interfaz `IEventRepository` con implementación `TypeOrmEventRepository`
- Tabla: `events` (id, event_id, timestamp, service, message, metadata [JSONB], ingested_at, created_at)
  - **Timezone**: Todas las fechas en UTC
  - **Metadata**: Tipo JSONB nativo de PostgreSQL para consultas JSON eficientes
- Índice compuesto: `(service, timestamp)` para optimización de consultas
- Transacciones atómicas para batch inserts eficientes
- **Circuit Breaker:** Protege operaciones de DB (CLOSED → OPEN → HALF_OPEN)
- **Queries optimizadas:** `findByServiceAndTimeRangeWithCount` ejecuta find y count en paralelo
- PostgreSQL para producción (mayor escalabilidad y concurrencia)
- Connection pooling configurado (max 20 conexiones, configurable via `DB_POOL_MAX`)

---

### 1.5 Sistema de Retención (Retention Service)
**Responsabilidad:**
- Eliminar automáticamente eventos mayores a 30 días
- Ejecutar job programado diariamente (cron configurable)
- Manejar errores sin detener el sistema
- Proporcionar logs de eventos eliminados

**Características clave:**
- Job programado con `SchedulerRegistry` y `CronJob` (dinámico desde env vars)
- Configurable via variable de entorno (RETENTION_DAYS, RETENTION_CRON_SCHEDULE)
- Ejecución automática según cron schedule
- Manejo de errores resiliente con `ErrorLogger`
- Protección con Circuit Breaker (si está disponible)

---

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTES                                 │
│              (Servicios que envían eventos)                      │
└──────────────────────────┬──────────────────────────────────────┘
                            │
                            │ POST /events
                            │ (JSON payload)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. API DE INGESTA (EventsController)                           │
│     • Validación en el borde                                    │
│     • Enriquecimiento (eventId, ingestedAt)                     │
│     • Respuesta inmediata: 202 Accepted                         │
│     • Backpressure: 429/503 si buffer lleno                     │
└──────────────────────────┬──────────────────────────────────────┘
                            │
                            │ enqueue()
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. BUFFER EN MEMORIA (EventBufferService)                      │
│     • Cola thread-safe (50,000 eventos, configurable)          │
│     • Checkpoint cada 5 segundos                                │
│     • Métricas: tamaño, capacidad, utilización                 │
└──────────────────────────┬──────────────────────────────────────┘
                            │
                            │ drainBatch(500)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. BATCH WORKER (BatchWorkerService)                           │
│     • Procesa cada 1 segundo                                    │
│     • Validación profunda                                       │
│     • Batch insert (5,000 eventos, configurable)               │
│     • Reintentos con exponential backoff                        │
└──────────────────────────┬──────────────────────────────────────┘
                            │
                            │ batchInsert()
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. ALMACENAMIENTO (PostgreSQL)                                 │
│     • Tabla: events                                             │
│     • Índice: (service, timestamp)                              │
│     • Transacciones atómicas                                    │
└──────────────────────────┬──────────────────────────────────────┘
                            │
                            │ GET /events?service=X&from=Y&to=Z
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. RETENCIÓN (RetentionService)                               │
│     • Job diario (cron)                                         │
│     • Elimina eventos > 30 días                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flujo de Datos Simplificado

```
1. Cliente → POST /events → API de Ingesta
2. API → Validación → Buffer (RAM)
3. Worker → Drena buffer → Batch insert → PostgreSQL
4. Cliente → GET /events → Consulta PostgreSQL
5. Retención → Elimina eventos antiguos (diario)
```

---

## Componentes Adicionales (Infraestructura)

### 6. Circuit Breaker Service
**Responsabilidad:**
- Proteger operaciones de base de datos contra cascading failures
- Estados: CLOSED (normal) → OPEN (rechaza requests) → HALF_OPEN (testing recovery)
- Configuración: 5 fallos para abrir, 2 éxitos para cerrar, 30s timeout

**Características clave:**
- Previene saturación cuando DB está caída
- Auto-recuperación cuando servicio se restaura
- Métricas de estado disponibles

### 7. Error Logger (Utilidad Centralizada)
**Responsabilidad:**
- Estandarizar formato de logs de error/warning
- Incluir contexto estructurado (eventId, service, parámetros)
- Facilitar debugging y monitoreo

**Características clave:**
- Métodos: `logError()`, `logWarning()`, `createContext()`
- Contexto estructurado (no stringificado, Logger maneja serialización)
- Usado consistentemente en todos los servicios

### 8. Repository Pattern
**Responsabilidad:**
- Abstraer acceso a base de datos
- Interfaz `IEventRepository` con implementación `TypeOrmEventRepository`
- Facilita testing y migración futura

**Características clave:**
- Dependency Injection con token (`EVENT_REPOSITORY_TOKEN`)
- Métodos optimizados: `findByServiceAndTimeRangeWithCount` (queries paralelas)
- Protección con Circuit Breaker integrada

---

## Principios de Diseño

### 1. **Separación de Responsabilidades**
- Cada componente tiene una responsabilidad única y clara
- Repository Pattern para abstraer acceso a datos
- No hay acoplamiento fuerte entre componentes

### 2. **No Bloqueo en Request Path**
- La API nunca espera operaciones de almacenamiento
- Respuesta inmediata (202 Accepted) con event_id
- Procesamiento asíncrono en background

### 3. **Resiliencia ante Fallos**
- Eventos inválidos se rechazan en el borde
- Buffer protege contra picos de tráfico
- Circuit Breaker protege contra cascading failures
- Reintentos automáticos para fallos transitorios
- Checkpoint streaming para recuperación ante crashes
- Graceful shutdown con timeout protection

### 4. **Simplicidad para MVP**
- Sin dependencias externas complejas (Redis, Kafka, etc.)
- PostgreSQL para almacenamiento (setup con Docker, fácil desarrollo)
- Buffer en memoria optimizado (bufferHead para eficiencia)
- Código claro y mantenible

### 5. **Observabilidad**
- Métricas avanzadas del buffer (`/metrics`: drop rate, throughput, health status)
- Health checks (`/health`, `/live`, `/ready`)
- Logging estructurado con `ErrorLogger`
- Swagger documentation
- Métricas de performance en worker

---

## Capacidades del Sistema

### Throughput
- **Ingesta:** ~5,000 eventos/segundo
  - Buffer: 50,000 eventos (absorbe picos, configurable via `BUFFER_MAX_SIZE`)
  - Worker: 5,000 eventos/batch × 1 batch/segundo = 5,000 eventos/segundo (configurable via `BATCH_SIZE` y `DRAIN_INTERVAL`)

### Latencia
- **Ingesta:** < 5ms (request path)
- **Consulta:** < 100ms (con índices)

### Resiliencia
- **Backpressure:** Rechaza eventos cuando buffer lleno (429/503)
- **Recuperación:** Checkpoint cada 5 segundos
- **Reintentos:** Exponential backoff para fallos transitorios

### Escalabilidad
- **Horizontal:** API stateless (múltiples instancias)
- **Vertical:** Buffer y worker configurables
- **Almacenamiento:** PostgreSQL con connection pooling (preparado para escalar)

---

## Decisiones de Arquitectura

### ¿Por qué Buffer en Memoria?
- **Simplicidad:** No requiere infraestructura externa
- **Velocidad:** Acceso O(1), muy rápido
- **Trade-off:** Pérdida de eventos en crash (mitigado con checkpoint)

### ¿Por qué PostgreSQL?
- **Escalabilidad:** Mejor concurrencia y rendimiento que SQLite
- **Producción:** Estándar para sistemas que requieren alta disponibilidad
- **Setup:** Fácil con Docker (docker-compose up)
- **Características:** Connection pooling, índices avanzados, transacciones robustas

### ¿Por qué Batch Processing?
- **Eficiencia:** Batch insert es ~10x más rápido que inserts individuales
- **Throughput:** Reduce roundtrips a la base de datos
- **Costo:** Menor carga en almacenamiento

### ¿Por qué Checkpoint?
- **Recuperación:** Recupera eventos ante crashes
- **Pérdida mínima:** Máximo 5 segundos de eventos perdidos
- **Simplicidad:** Solo archivos en disco, sin infraestructura adicional

