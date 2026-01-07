# Arquitectura del Sistema - Aurore Events MVP

Este documento describe la arquitectura del sistema, los módulos principales, las clases y sus responsabilidades.

## Tabla de Contenidos

- [Visión General](#visión-general)
- [Módulos Principales](#módulos-principales)
  - [Event Module](#event-module)
  - [Batch Worker Module](#batch-worker-module)
  - [Retention Module](#retention-module)
  - [Common Module](#common-module)
  - [Config Module](#config-module)
- [Flujo de Datos](#flujo-de-datos)
- [Patrones de Diseño](#patrones-de-diseño)

---

## Visión General

El sistema está diseñado con una arquitectura modular basada en **NestJS**, siguiendo principios de **separación de responsabilidades** y **inyección de dependencias**. El objetivo es manejar ingesta de alto rendimiento (~5,000 eventos/segundo) con procesamiento asíncrono y almacenamiento eficiente.

### Características Arquitectónicas

- **Arquitectura Modular**: Cada funcionalidad está encapsulada en su propio módulo
- **Patrón Repository**: Abstracción de la capa de datos mediante interfaces
- **Buffer en Memoria**: Cola thread-safe para absorber picos de tráfico
- **Procesamiento por Lotes**: Escritura eficiente a base de datos mediante batching
- **Circuit Breaker**: Protección contra fallos en cascada de la base de datos
- **Separación de Concerns**: Controladores, servicios, repositorios y entidades claramente separados
- **Timezone UTC**: Todas las fechas y timestamps se almacenan y procesan en UTC para consistencia global
- **JSONB nativo**: Metadata almacenada como JSONB de PostgreSQL para consultas JSON eficientes y validación automática

---

## Módulos Principales

### Root Module

**Ubicación**: `src/`

Contiene el controlador principal de la aplicación y configuración global.

#### Controllers

##### `AppController`
**Archivo**: `app.controller.ts`

- **Responsabilidad**: Endpoints de health check globales de la aplicación
- **Endpoints**:
  - `GET /health` - Health check general (readiness) - Retorna estado del servidor
  - `GET /live` - Liveness check (verifica que el servidor no esté apagándose)
  - `GET /ready` - Readiness check (verifica que el servidor esté listo para recibir tráfico)
- **Características**:
  - Usa `HealthService` para determinar el estado
  - Manejo de errores con logging estructurado mediante `IErrorLoggerService`
  - Respuestas HTTP apropiadas (200 OK, 503 Service Unavailable)
  - Inyección de dependencias mediante interfaces (`ERROR_LOGGER_SERVICE_TOKEN`)

---

### Event Module

**Ubicación**: `src/modules/event/`

Responsable de la ingesta, almacenamiento y consulta de eventos.

#### Controllers

##### `EventController`
**Archivo**: `controllers/events.controller.ts`

- **Responsabilidad**: Maneja las peticiones HTTP para ingesta y consulta de eventos
- **Endpoints**:
  - `POST /events` - Ingestion de eventos (202 Accepted cuando se acepta)
  - `GET /events` - Consulta de eventos con filtros y paginación (query params: service, from, to, page, pageSize, sortField, sortOrder)
  - `GET /metrics` - Métricas del buffer y estado del sistema (buffer size, capacity, utilization, throughput)
- **Características**:
  - Validación de entrada mediante DTOs (class-validator)
  - Rate limiting configurable por endpoint (global, query, health limits)
  - Sanitización de inputs para prevenir XSS (mediante `ISanitizerService`)
  - Generación de Correlation IDs para trazabilidad (middleware)
  - Manejo de respuestas 429 (Buffer lleno) y 503 (Service unavailable)
  - Inyección de dependencias mediante interfaces (`EVENT_SERVICE_TOKEN`, `EVENT_BUFFER_SERVICE_TOKEN`, `ERROR_LOGGER_SERVICE_TOKEN`)
  - Configuración de rate limiting mediante `CONFIG_TOKENS.RATE_LIMITING`

##### `EventHealthController`
**Archivo**: `controllers/event-health.controller.ts`

- **Responsabilidad**: Endpoints de health check y métricas del sistema
- **Endpoints**:
  - `GET /health/buffer` - Estado y métricas del buffer (size, capacity, utilization, throughput, drop rate)
  - `GET /health/database` - Estado de conexión a BD y circuit breaker (estado del circuito, métricas)
  - `GET /health/business` - Métricas de negocio (eventos por servicio, tendencias, top servicios, eventos por hora)
  - `GET /health/detailed` - Estado completo del sistema (agrega todos los componentes: server, database, buffer, circuit breaker, business)
- **Características**:
  - Rate limiting configurable para endpoints de health (menor que endpoints de ingesta)
  - Uso de `Promise.allSettled()` para obtener métricas de múltiples componentes sin fallar si uno falla
  - Inyección de dependencias mediante interfaces (`HEALTH_SERVICE_TOKEN`, `CIRCUIT_BREAKER_SERVICE_TOKEN`, `EVENT_BUFFER_SERVICE_TOKEN`)
  - Cache de métricas de negocio (1 minuto) para reducir carga en BD

#### Services

##### `EventService`
**Archivo**: `services/events.service.ts`

- **Responsabilidad**: Lógica de negocio principal para eventos
- **Métodos principales**:
  - `ingest()` - Enriquece eventos con metadata (ID, timestamp) y los encola al buffer
  - `insert()` - Inserta eventos en batch a la base de datos (usado por batch worker)
  - `search()` - Busca eventos por servicio y rango de tiempo con paginación
  - `cleanup()` - Elimina eventos más antiguos que el período de retención
- **Características**:
  - Sanitización de inputs
  - Generación de IDs únicos para eventos
  - Validación de rangos de tiempo
  - Manejo de errores con logging

##### `EventBufferService`
**Archivo**: `services/event-buffer.service.ts`

- **Responsabilidad**: Gestión del buffer en memoria para eventos
- **Características**:
  - Cola thread-safe (usa arrays y mutex lógico)
  - Checkpoint automático a archivo JSON para recovery ante crashes
  - Métricas de tamaño, throughput, y estado del buffer
  - Protección contra saturación (backpressure)
  - Recuperación automática de checkpoints al iniciar
- **Métodos principales**:
  - `enqueue()` - Agrega evento al buffer
  - `drain()` - Extrae eventos del buffer para procesamiento
  - `getSize()` - Retorna tamaño actual del buffer
  - `getMetrics()` - Retorna métricas de rendimiento

##### `BusinessMetricsService`
**Archivo**: `services/business-metrics.service.ts`

- **Responsabilidad**: Cálculo de métricas de negocio
- **Métricas calculadas**:
  - Total de eventos
  - Eventos por servicio
  - Eventos en últimas 24 horas y última hora
  - Promedio de eventos por minuto
  - Top servicios
  - Eventos por hora (últimas 24 horas)
- **Características**:
  - Cache de 1 minuto para reducir carga en BD
  - Actualización automática periódica

##### `MetricsPersistenceService`
**Archivo**: `services/metrics-persistence.service.ts`

- **Responsabilidad**: Persistencia de métricas a archivo JSONL para análisis histórico
- **Características**:
  - Escritura asíncrona sin bloquear el pipeline principal
  - Formato JSONL para fácil análisis
  - Manejo de errores sin afectar el flujo principal

#### Repositories

##### `TypeOrmEventRepository`
**Archivo**: `repositories/typeorm-event.repository.ts`

- **Responsabilidad**: Implementación de acceso a datos usando TypeORM
- **Implementa**: `IEventRepository` (patrón Repository)
- **Métodos principales**:
  - `batchInsert()` - Inserta eventos en batch con transacciones
  - `findByServiceAndTimeRangeWithCount()` - Consulta optimizada con índices compuestos y conteo
  - `deleteOldEvents()` - Elimina eventos antiguos para retención
- **Características**:
  - Uso de índices compuestos para optimizar consultas
  - Transacciones para garantizar atomicidad
  - Protección con Circuit Breaker
  - Manejo de errores con retry logic

##### `TypeOrmBusinessMetricsRepository`
**Archivo**: `repositories/typeorm-business-metrics.repository.ts`

- **Responsabilidad**: Implementación de acceso a datos para métricas de negocio usando TypeORM
- **Implementa**: `IBusinessMetricsRepository` (patrón Repository)
- **Métodos principales**:
  - `getTotalEventsCount()` - Obtiene el conteo total de eventos
  - `getEventsByService()` - Agrupa eventos por servicio
  - `getEventsByTimeRange()` - Obtiene conteos por rango de tiempo
  - `getEventsByHour()` - Agrupa eventos por hora (últimas 24 horas)
- **Características**:
  - Consultas optimizadas con agregaciones SQL
  - Uso de índices para mejorar rendimiento
  - Manejo de errores con logging estructurado

##### `FileMetricsRepository`
**Archivo**: `repositories/file-metrics.repository.ts`

- **Responsabilidad**: Persistencia de métricas del sistema a archivo JSONL
- **Implementa**: `IMetricsRepository` (patrón Repository)
- **Métodos principales**:
  - `initialize()` - Crea directorio de métricas si no existe
  - `save()` - Guarda snapshot de métricas en formato JSONL
  - `getHistory()` - Obtiene historial de métricas (últimas N entradas)
- **Características**:
  - Formato JSONL para fácil análisis
  - Escritura asíncrona sin bloquear
  - Manejo de errores sin afectar el flujo principal

#### Entities

##### `Event`
**Archivo**: `entities/event.entity.ts`

- **Responsabilidad**: Definición de la entidad de base de datos
- **Campos**:
  - `id` (UUID, Primary Key)
  - `eventId` (varchar 20, unique) - ID único del evento generado por el sistema
  - `timestamp` (text) - Timestamp del evento en formato ISO 8601 UTC (e.g., '2024-01-15T10:30:00.000Z')
  - `service` (varchar 100) - Nombre del servicio
  - `message` (text) - Mensaje del evento
  - `metadata` (jsonb, nullable) - Metadata en formato JSONB nativo de PostgreSQL (permite consultas JSON nativas)
  - `ingestedAt` (text) - Timestamp de ingesta en formato ISO 8601 UTC
  - `createdAt` (timestamp with time zone) - Timestamp de creación en BD (UTC)
- **Nota sobre Timezone**: Todas las fechas y timestamps se almacenan y procesan en UTC
- **Nota sobre Metadata**: Usa JSONB nativo de PostgreSQL para consultas JSON eficientes y validación automática
- **Índices**:
  - Compuesto: `[service, timestamp]` - Para consultas por servicio y tiempo
  - Compuesto: `[service, createdAt]` - Para métricas de negocio
  - Simple: `[timestamp]` - Para operaciones de retención
  - Simple: `[createdAt]` - Para métricas de negocio
  - Simple: `[eventId]` - Para búsquedas por eventId

#### DTOs (Data Transfer Objects)

- `CreateEventDto` - Validación de eventos entrantes
- `QueryDto` - Validación de parámetros de consulta
- `IngestResponseDto` - Respuesta de ingesta
- `SearchResponseDto` - Respuesta de búsqueda con paginación
- `BusinessMetricsResponseDto` - Respuesta de métricas de negocio

#### Interfaces

**Servicios**:
- `IEventService` - Contrato del servicio de eventos
- `IEventBufferService` - Contrato del servicio de buffer
- `IMetricsPersistenceService` - Contrato del servicio de persistencia de métricas

**Repositorios**:
- `IEventRepository` - Contrato del repositorio de eventos
- `IBusinessMetricsRepository` - Contrato del repositorio de métricas de negocio
- `IMetricsRepository` - Contrato del repositorio de métricas del sistema

**Tipos**:
- `EnrichedEvent` - Evento enriquecido con metadata (ID, timestamp de ingesta)
- `BatchInsertResult` - Resultado de inserción en batch (successful, failed)
- `ServiceCountRow` - Fila de conteo por servicio
- `HourlyCountRow` - Fila de conteo por hora

---

### Batch Worker Module

**Ubicación**: `src/modules/batch-worker/`

Responsable del procesamiento asíncrono de eventos desde el buffer hacia la base de datos.

#### Services

##### `BatchWorkerService`
**Archivo**: `services/batch-worker.service.ts`

- **Responsabilidad**: Procesa eventos del buffer en batches y los inserta en BD
- **Características**:
  - Procesamiento periódico cada `DRAIN_INTERVAL` ms
  - Tamaño de batch configurable (`BATCH_SIZE`)
  - Retry logic con exponential backoff
  - Métricas de rendimiento (batches procesados, tiempo promedio)
  - Graceful shutdown: procesa todos los eventos pendientes antes de detenerse
  - Timeout de shutdown para prevenir loops infinitos
- **Flujo**:
  1. Extrae eventos del buffer (`drain()`)
  2. Valida y agrupa en batches
  3. Inserta en BD mediante `EventService.insert()`
  4. Maneja errores con retry
  5. Actualiza métricas

---

### Retention Module

**Ubicación**: `src/modules/retention/`

Responsable de la limpieza automática de eventos antiguos.

#### Services

##### `RetentionService`
**Archivo**: `services/retention.service.ts`

- **Responsabilidad**: Elimina eventos más antiguos que el período de retención
- **Características**:
  - Job programado con cron (`RETENTION_CRON_SCHEDULE`)
  - Configuración dinámica desde variables de entorno
  - Limpieza por días configurables (`RETENTION_DAYS`, default: 30 días)
  - Método `cleanupNow()` para ejecución manual (testing)
  - Logging detallado de operaciones
- **Ejecución**: Diaria a las 2 AM (configurable)

---

### Common Module

**Ubicación**: `src/modules/common/`

Funcionalidades compartidas entre módulos.

#### Services

##### `CircuitBreakerService`
**Archivo**: `services/circuit-breaker.service.ts`

- **Responsabilidad**: Protección contra fallos en cascada de la base de datos
- **Estados**:
  - `CLOSED` - Operación normal
  - `OPEN` - Circuito abierto, rechazando peticiones
  - `HALF_OPEN` - Probando si el servicio se recuperó
- **Características**:
  - Configuración mediante variables de entorno
  - Transición automática de estados
  - Timeout antes de intentar `HALF_OPEN`
  - Tracking de fallos y éxitos

##### `HealthService`
**Archivo**: `services/health.service.ts`

- **Responsabilidad**: Agregación de estados de salud de componentes
- **Características**:
  - Estado del buffer
  - Estado de la base de datos
  - Estado del circuit breaker

##### `ErrorHandlingService`
**Archivo**: `services/error-handling.service.ts`

- **Responsabilidad**: Manejo centralizado de errores
- **Características**:
  - Clasificación de errores
  - Logging estructurado
  - Formateo de respuestas de error

##### `ErrorLoggerService`
**Archivo**: `services/error-logger.service.ts`

- **Responsabilidad**: Logging estructurado de errores con contexto
- **Implementa**: `IErrorLoggerService` (interfaz para desacoplamiento)
- **Características**:
  - Formato consistente de logs
  - Contexto adicional (eventId, service, metadata)
  - Stack traces completos
  - Separación de errores y warnings

##### `SanitizerService`
**Archivo**: `services/sanitizer.service.ts`

- **Responsabilidad**: Sanitización de inputs para prevenir XSS
- **Implementa**: `ISanitizerService` (interfaz para desacoplamiento)
- **Características**:
  - Limpieza de HTML/JavaScript
  - Validación de longitudes máximas
  - Escape de caracteres especiales
  - Sanitización de objetos anidados

##### `MetricsCollectorService`
**Archivo**: `services/metrics-collector.service.ts`

- **Responsabilidad**: Recolección y agregación centralizada de métricas del sistema
- **Implementa**: `IMetricsCollectorService` (interfaz para desacoplamiento)
- **Características**:
  - Métricas de buffer (enqueues, drops, drains)
  - Métricas de batch worker (batches procesados, tiempo promedio)
  - Separación de métricas de lógica de negocio
  - Snapshot de métricas para consulta
  - Métodos principales:
    - `recordBufferEnqueue()` - Registra evento encolado
    - `recordBufferDrop()` - Registra evento rechazado (backpressure)
    - `recordBufferDrain()` - Registra drenado del buffer
    - `recordBatchProcessed()` - Registra procesamiento de batch con métricas de tiempo
    - `getBufferMetrics()` - Obtiene snapshot de métricas del buffer
    - `getBatchWorkerMetrics()` - Obtiene snapshot de métricas del batch worker
    - `reset()` - Resetea todas las métricas (útil para testing)
- **Uso**: Inyectado en `EventBufferService` y `BatchWorkerService` mediante `METRICS_COLLECTOR_SERVICE_TOKEN`

#### Guards

##### `IpThrottlerGuard`
**Archivo**: `guards/ip-throttler.guard.ts`

- **Responsabilidad**: Rate limiting por IP
- **Características**:
  - Límite configurable de peticiones por ventana de tiempo
  - Respuesta 429 cuando se excede el límite
  - Tracking por IP address

#### Middleware

##### `CorrelationIdMiddleware`
**Archivo**: `middleware/correlation-id.middleware.ts`

- **Responsabilidad**: Generación y propagación de Correlation IDs
- **Características**:
  - ID único por request
  - Inyectado en headers y logs
  - Trazabilidad end-to-end

#### Utils

##### `Tracing`
**Archivo**: `utils/tracing.ts`

- **Responsabilidad**: Utilidades para distributed tracing
- **Características**:
  - Generación de trace IDs y span IDs
  - Creación de contextos de tracing
  - Contextos hijos para operaciones anidadas
  - Cálculo de duración de operaciones
  - Formateo de traces para logging

##### `Type Guards`
**Archivo**: `utils/type-guards.ts`

- **Responsabilidad**: Validación de tipos en tiempo de ejecución
- **Funciones**:
  - `isNonEmptyString()` - Valida strings no vacíos
  - `isValidDateString()` - Valida fechas en formato ISO 8601 o Unix epoch
  - `isPlainObject()` - Valida objetos planos (no arrays, no null)
  - `isNumberInRange()` - Valida números dentro de un rango
  - `isPositiveInteger()` - Valida enteros positivos

---

### Config Module

**Ubicación**: `src/modules/config/`

Gestión centralizada de configuración.

#### Services

##### `envs` (Configuración)
**Archivo**: `envs.ts`

- **Responsabilidad**: Carga y validación de variables de entorno
- **Características**:
  - Validación con Zod
  - Tipos TypeScript generados
  - Valores requeridos (sin defaults)
  - Esquemas de validación por categoría

##### `config-factory` (Factory Functions)
**Archivo**: `config-factory.ts`

- **Responsabilidad**: Transformación de variables de entorno en objetos de configuración tipados
- **Funciones factory**:
  - `createServerConfig()` - Configuración del servidor
  - `createDatabaseConfig()` - Configuración de base de datos
  - `createBatchWorkerConfig()` - Configuración del batch worker
  - `createBufferConfig()` - Configuración del buffer
  - `createRetentionConfig()` - Configuración de retención
  - `createQueryConfig()` - Configuración de consultas
  - `createServiceConfig()` - Configuración de servicios
  - `createValidationConfig()` - Configuración de validación
  - `createCheckpointConfig()` - Configuración de checkpoints
  - `createCircuitBreakerConfig()` - Configuración del circuit breaker
  - `createShutdownConfig()` - Configuración de shutdown
  - `createMetricsConfig()` - Configuración de métricas (con valores por defecto)
  - `createRateLimitingConfig()` - Configuración de rate limiting (TTL, global limit, IP limit, query limit, health limit)
- **Características**:
  - Objetos de configuración tipados
  - Valores por defecto donde corresponde (métricas tiene defaults)
  - Inyección mediante tokens en `ConfigModule` (todos los configs disponibles globalmente)
  - Configuración de pool de conexiones de PostgreSQL (`DB_POOL_MAX` en `createDatabaseConfig()`)

---

## Flujo de Datos

### 1. Ingesta de Eventos

```
Cliente → EventController → EventService.ingest()
                              ↓
                         Sanitización
                              ↓
                         Enriquecimiento (ID, timestamp)
                              ↓
                         EventBufferService.enqueue()
                              ↓
                         Buffer en Memoria
```

### 2. Procesamiento de Eventos

```
BatchWorkerService (cada DRAIN_INTERVAL)
         ↓
  EventBufferService.drain() (hasta BATCH_SIZE eventos)
         ↓
  EventService.insert()
         ↓
  CircuitBreakerService.execute()
         ↓
  TypeOrmEventRepository.insertBatch()
         ↓
  PostgreSQL (Transacción)
```

### 3. Consulta de Eventos

```
Cliente → EventController → EventService.search()
                              ↓
                         Validación QueryDto
                              ↓
                         CircuitBreakerService.execute()
                              ↓
                         TypeOrmEventRepository.findByServiceAndTimeRange()
                              ↓
                         PostgreSQL (Query con índices)
                              ↓
                         Paginación y formateo
                              ↓
                         Respuesta al Cliente
```

### 4. Retención

```
Cron Job (diario 2 AM)
         ↓
  RetentionService.cleanup()
         ↓
  EventService.cleanup()
         ↓
  TypeOrmEventRepository.deleteOldEvents()
         ↓
  PostgreSQL (DELETE WHERE timestamp < threshold)
```

---

## Patrones de Diseño

### 1. Repository Pattern
- **Implementación**: `IEventRepository` interface con `TypeOrmEventRepository`
- **Beneficio**: Abstracción de la capa de datos, facilita testing y cambios de BD

### 2. Service Layer Pattern
- **Implementación**: Lógica de negocio en servicios, controladores delgados
- **Beneficio**: Separación de concerns, reutilización de código

### 3. Dependency Injection
- **Implementación**: NestJS DI container con interfaces y tokens
- **Características**:
  - **100% de servicios desacoplados** mediante interfaces
  - Uso de tokens de inyección (`*_TOKEN`) para desacoplamiento
  - Todas las dependencias usan interfaces (`IEventService`, `IEventRepository`, `IMetricsCollectorService`, etc.)
  - Facilita testing con mocks
  - Permite intercambiar implementaciones sin modificar código
- **Beneficio**: Desacoplamiento completo, testing facilitado, configurabilidad, mantenibilidad

### 4. Circuit Breaker Pattern
- **Implementación**: `CircuitBreakerService`
- **Beneficio**: Prevención de fallos en cascada, resiliencia

### 5. Buffer/Queue Pattern
- **Implementación**: `EventBufferService`
- **Beneficio**: Absorción de picos, desacoplamiento de ingesta y persistencia

### 6. Batch Processing Pattern
- **Implementación**: `BatchWorkerService`
- **Beneficio**: Eficiencia en escrituras a BD, throughput optimizado

### 7. Strategy Pattern
- **Implementación**: Interfaces para servicios (ej: `IEventService`, `IEventRepository`)
- **Beneficio**: Flexibilidad, extensibilidad

### 8. Interface Segregation & Dependency Inversion
- **Implementación**: 
  - **100% de servicios desacoplados** mediante interfaces
  - Todos los servicios usan interfaces (`IEventService`, `IEventRepository`, `IMetricsCollectorService`, `IErrorLoggerService`, `ISanitizerService`, etc.)
  - Tokens de inyección (`*_TOKEN`) para desacoplamiento completo
  - Ningún servicio depende directamente de clases concretas
- **Beneficio**: 
  - Testing facilitado (mocks simples)
  - Intercambio de implementaciones sin modificar código
  - Bajo acoplamiento y alta cohesión
  - Mantenibilidad mejorada

---

## Diagrama de Módulos

```
┌─────────────────────────────────────────────────────────┐
│                    Event Module                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Controllers  │  │   Services   │  │ Repositories │ │
│  │              │  │              │  │              │ │
│  │ EventController││ EventService │  │TypeOrmEvent  │ │
│  │ EventHealth  │  │ Buffer       │  │ Repository   │ │
│  │              │  │ Business     │  │              │ │
│  │              │  │ Metrics      │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
         ▲                    │                  │
         │                    │                  │
         │                    ▼                  │
┌────────┴──────────────────────────────────────┴────────┐
│              Batch Worker Module                        │
│         ┌─────────────────────────┐                    │
│         │  BatchWorkerService     │                    │
│         │  (Procesamiento async)  │                    │
│         └─────────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              Retention Module                           │
│         ┌─────────────────────────┐                    │
│         │  RetentionService       │                    │
│         │  (Cleanup automático)   │                    │
│         └─────────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              Common Module                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Circuit      │  │    Health    │  │    Utils     │ │
│  │ Breaker      │  │   Service    │  │  Sanitizer   │ │
│  │              │  │              │  │  ErrorLogger │ │
│  │              │  │              │  │  Tracing     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL Database                        │
│         (Con índices compuestos optimizados)            │
└─────────────────────────────────────────────────────────┘
```

---

## Consideraciones de Diseño

### Escalabilidad
- Buffer en memoria para absorber picos
- Procesamiento asíncrono con batches
- Índices optimizados en BD para consultas rápidas

### Resiliencia
- Circuit breaker para proteger contra fallos de BD
- Checkpoint del buffer para recovery ante crashes
- Retry logic con exponential backoff
- Manejo de errores sin romper el pipeline

### Mantenibilidad
- Código modular y bien separado
- **100% de servicios desacoplados** mediante interfaces
- Interfaces claras (contratos) para todos los servicios
- Logging estructurado
- Testing unitario completo (37 archivos de test)
- Factory functions para configuración tipada

### Desacoplamiento
- **Arquitectura basada en interfaces**: Todos los servicios implementan interfaces
- **Inyección por tokens**: Uso de tokens (`*_TOKEN`) en lugar de clases concretas
- **Métricas de acoplamiento**:
  - Servicios con interfaces: 12/12 (100%)
  - Repositorios con interfaces: 3/3 (100%)
  - Servicios acoplados a clases concretas: 0/12 (0%)
- **Beneficios**:
  - Testing facilitado (mocks simples)
  - Intercambio de implementaciones sin modificar código
  - Bajo acoplamiento y alta cohesión
  - Mantenibilidad mejorada

### Seguridad
- Sanitización de inputs mediante `ISanitizerService`
- Rate limiting configurable por tipo de endpoint (global, query, health)
- Validación estricta de DTOs con class-validator
- Circuit breaker para proteger contra fallos en cascada
- Manejo seguro de errores sin exponer información sensible

---

## Referencias

- [NestJS Documentation](https://docs.nestjs.com/)
- [TypeORM Documentation](https://typeorm.io/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

