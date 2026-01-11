# Documentación de Testing - Aurore Events MVP

> 📖 **Para una guía práctica paso a paso**, ver [`TESTING_GUIDE.md`](./TESTING_GUIDE.md)
> 
> Este documento se enfoca en la **estrategia técnica**, **cobertura de tests** y **mejores prácticas**.

Este documento describe la estrategia de testing del proyecto, los tests unitarios implementados y cómo ejecutarlos.

## Tabla de Contenidos

- [Visión General](#visión-general)
- [Cobertura de Tests](#cobertura-de-tests)
- [Tests Unitarios](#tests-unitarios)
  - [Event Module Tests](#event-module-tests)
  - [Batch Worker Tests](#batch-worker-tests)
  - [Retention Tests](#retention-tests)
  - [Common Module Tests](#common-module-tests)
  - [Config Tests](#config-tests)
- [Tests E2E](#tests-e2e)
- [Ejecución de Tests](#ejecución-de-tests)
- [Estrategia de Testing](#estrategia-de-testing)

---

## Visión General

El proyecto implementa una estrategia de testing completa que incluye:

- **Tests Unitarios**: Cobertura de servicios, repositorios y utilidades
- **Tests E2E**: Validación de flujos completos mediante HTTP
- **Mocks y Stubs**: Aislamiento de dependencias para tests rápidos y determinísticos
- **Test Coverage**: Métricas de cobertura de código

**Framework de Testing**: Jest (incluido con NestJS)

---

## Cobertura de Tests

### Tests Unitarios Disponibles

| Módulo | Archivo de Test | Cobertura |
|--------|----------------|-----------|
| **Root** | | |
| | `app.controller.spec.ts` | AppController - health checks (health, liveness, readiness) |
| **Event Module** | | |
| | `events.service.spec.ts` | EventService - lógica de negocio |
| | `event-buffer.service.spec.ts` | EventBufferService - buffer y checkpoints |
| | `business-metrics.service.spec.ts` | BusinessMetricsService - cálculos de métricas |
| | `metrics-persistence.service.spec.ts` | MetricsPersistenceService - persistencia |
| | `typeorm-event.repository.spec.ts` | TypeOrmEventRepository - acceso a datos |
| | `typeorm-business-metrics.repository.spec.ts` | TypeOrmBusinessMetricsRepository - métricas de negocio |
| | `file-metrics.repository.spec.ts` | FileMetricsRepository - persistencia de métricas |
| | `events.controller.spec.ts` | EventController - endpoints de ingesta y consulta |
| | `event-health.controller.spec.ts` | EventHealthController - endpoints de health |
| **Batch Worker** | `batch-worker.service.spec.ts` | BatchWorkerService - procesamiento por lotes |
| **Retention** | `retention.service.spec.ts` | RetentionService - limpieza automática |
| **Common Module** | | |
| | `circuit-breaker.service.spec.ts` | CircuitBreakerService - protección contra fallos |
| | `sanitizer.service.spec.ts` | SanitizerService - sanitización de inputs |
| | `error-handling.service.spec.ts` | ErrorHandlingService - manejo de errores |
| | `error-logger.service.spec.ts` | ErrorLoggerService - logging de errores |
| | `health.service.spec.ts` | HealthService - estado de salud |
| | `metrics-collector.service.spec.ts` | MetricsCollectorService - recolección de métricas |
| | `ip-throttler.guard.spec.ts` | IpThrottlerGuard - rate limiting |
| | `correlation-id.middleware.spec.ts` | CorrelationIdMiddleware - correlation IDs |
| | `tracing.spec.ts` | Tracing - utilidades de tracing |
| | `type-guards.spec.ts` | Type Guards - validación de tipos |
| **Config** | `envs.spec.ts` | Validación de variables de entorno |
| | `config-factory.spec.ts` | Config Factory - creación de objetos de configuración |

### Tests E2E Disponibles

| Archivo | Descripción |
|---------|-------------|
| `business-metrics.e2e-spec.ts` | Tests de endpoints de métricas de negocio |
| `correlation-id.e2e-spec.ts` | Tests de Correlation ID en requests |
| `rate-limiting.e2e-spec.ts` | Tests de rate limiting por IP |
| `sanitization.e2e-spec.ts` | Tests de sanitización de inputs |

---

## Tests Unitarios

### Event Module Tests

#### `events.service.spec.ts`
**Cubre**: `EventService`

**Casos de prueba**:
- ✅ `ingest()` - Enriquecimiento de eventos con metadata
- ✅ `ingest()` - Sanitización de inputs
- ✅ `ingest()` - Manejo de buffer saturado (excepción)
- ✅ `insert()` - Inserción en batch exitosa
- ✅ `insert()` - Manejo de errores en inserción
- ✅ `search()` - Búsqueda por servicio y rango de tiempo
- ✅ `search()` - Paginación correcta
- ✅ `search()` - Ordenamiento (ascendente/descendente)
- ✅ `cleanup()` - Eliminación de eventos antiguos
- ✅ Validación de rangos de tiempo

**Mocks utilizados**:
- `IEventRepository` - Mock del repositorio
- `EventBufferService` - Mock del buffer

#### `event-buffer.service.spec.ts`
**Cubre**: `EventBufferService`

**Casos de prueba**:
- ✅ `enqueue()` - Agregar eventos al buffer
- ✅ `enqueue()` - Detección de buffer saturado
- ✅ `drain()` - Extracción de eventos del buffer
- ✅ `drain()` - Extracción de tamaño específico
- ✅ `getSize()` - Tamaño correcto del buffer
- ✅ `getMetrics()` - Cálculo de métricas
- ✅ Checkpoint - Guardado automático a archivo
- ✅ Recovery - Recuperación desde checkpoint
- ✅ Thread-safety - Operaciones concurrentes

**Características especiales**:
- Tests de checkpoint con archivos temporales
- Tests de recovery ante crashes
- Validación de formato JSON de checkpoints

#### `business-metrics.service.spec.ts`
**Cubre**: `BusinessMetricsService`

**Casos de prueba**:
- ✅ Cálculo de total de eventos
- ✅ Eventos por servicio
- ✅ Eventos en últimas 24 horas
- ✅ Eventos en última hora
- ✅ Promedio de eventos por minuto
- ✅ Top servicios ordenados
- ✅ Eventos por hora (últimas 24 horas)
- ✅ Cache - No recalcula si cache es válido
- ✅ Cache - Recalcula cuando cache expira

**Mocks utilizados**:
- `IEventRepository` - Mock con datos de prueba

#### `metrics-persistence.service.spec.ts`
**Cubre**: `MetricsPersistenceService`

**Casos de prueba**:
- ✅ Persistencia de métricas a archivo JSONL
- ✅ Formato correcto del JSONL
- ✅ Manejo de errores sin afectar el flujo principal
- ✅ Escritura asíncrona

#### `typeorm-event.repository.spec.ts`
**Cubre**: `TypeOrmEventRepository`

**Casos de prueba**:
- ✅ `insertBatch()` - Inserción en batch exitosa
- ✅ `insertBatch()` - Uso de transacciones
- ✅ `findByServiceAndTimeRange()` - Consulta con filtros
- ✅ `findByServiceAndTimeRange()` - Paginación
- ✅ `deleteOldEvents()` - Eliminación de eventos antiguos
- ✅ `count()` - Conteo de eventos
- ✅ Protección con Circuit Breaker
- ✅ Manejo de errores de BD

**Mocks utilizados**:
- `Repository<Event>` - Mock de TypeORM Repository
- `CircuitBreakerService` - Mock del circuit breaker

---

### Batch Worker Tests

#### `batch-worker.service.spec.ts`
**Cubre**: `BatchWorkerService`

**Casos de prueba**:
- ✅ `start()` - Inicio del worker
- ✅ `stop()` - Detención del worker
- ✅ Procesamiento periódico de batches
- ✅ Tamaño de batch configurable
- ✅ Retry logic con exponential backoff
- ✅ Graceful shutdown - Procesa eventos pendientes
- ✅ Timeout de shutdown - Previene loops infinitos
- ✅ Métricas de rendimiento
- ✅ Manejo de errores durante procesamiento

**Características especiales**:
- Tests de timing y intervalos
- Tests de shutdown con eventos pendientes
- Validación de retry logic

---

### Retention Tests

#### `retention.service.spec.ts`
**Cubre**: `RetentionService`

**Casos de prueba**:
- ✅ `onModuleInit()` - Registro de cron job
- ✅ `cleanup()` - Ejecución programada
- ✅ `cleanupNow()` - Ejecución manual
- ✅ Configuración de días de retención
- ✅ Configuración de cron schedule
- ✅ Manejo de errores en cleanup
- ✅ Logging de operaciones

**Mocks utilizados**:
- `EventService` - Mock del servicio de eventos
- `SchedulerRegistry` - Mock del scheduler de NestJS

---

### Common Module Tests

#### `circuit-breaker.service.spec.ts`
**Cubre**: `CircuitBreakerService`

**Casos de prueba**:
- ✅ Estado `CLOSED` - Operación normal
- ✅ Transición a `OPEN` - Tras múltiples fallos
- ✅ Estado `OPEN` - Rechazo de operaciones
- ✅ Transición a `HALF_OPEN` - Tras timeout
- ✅ Transición a `CLOSED` - Tras éxitos en `HALF_OPEN`
- ✅ Configuración de thresholds
- ✅ Tracking de fallos y éxitos
- ✅ Timeout antes de `HALF_OPEN`

**Características especiales**:
- Tests de máquina de estados
- Tests de timing y timeouts
- Validación de configuración

#### `sanitizer.spec.ts`
**Cubre**: `Sanitizer`

**Casos de prueba**:
- ✅ Sanitización de HTML peligroso
- ✅ Sanitización de JavaScript
- ✅ Sanitización de caracteres especiales
- ✅ Validación de longitudes máximas
- ✅ Preservación de contenido seguro
- ✅ Manejo de inputs nulos/undefined

**Características especiales**:
- Tests de seguridad (XSS prevention)
- Tests de casos edge (nulos, strings vacíos)

---

### Root Module Tests

#### `app.controller.spec.ts`
**Cubre**: `AppController`

**Casos de prueba**:
- ✅ `healthCheck()` - Retorna estado cuando servidor está listo
- ✅ `healthCheck()` - Lanza excepción cuando servidor no está listo
- ✅ `healthCheck()` - Lanza excepción cuando servidor está apagándose
- ✅ `livenessCheck()` - Retorna estado cuando servidor está vivo
- ✅ `livenessCheck()` - Lanza excepción cuando servidor está apagándose
- ✅ `readinessCheck()` - Retorna estado cuando servidor está listo
- ✅ `readinessCheck()` - Lanza excepción cuando servidor no está listo
- ✅ Manejo de errores inesperados con logging
- ✅ Re-lanzamiento de HttpException sin modificar

**Mocks utilizados**:
- `HealthService` - Mock del servicio de salud
- `IErrorLoggerService` - Mock del logger de errores

### Event Module Tests (Adicionales)

#### `typeorm-business-metrics.repository.spec.ts`
**Cubre**: `TypeOrmBusinessMetricsRepository`

**Casos de prueba**:
- ✅ `getTotalEventsCount()` - Conteo total de eventos
- ✅ `getEventsByService()` - Agrupación de eventos por servicio
- ✅ `getEventsByTimeRange()` - Conteos por rango de tiempo
- ✅ `getEventsByHour()` - Agrupación de eventos por hora
- ✅ Manejo de errores y logging
- ✅ Retorno de arrays vacíos cuando no hay datos

**Mocks utilizados**:
- `Repository<Event>` - Mock de TypeORM Repository
- `IErrorLoggerService` - Mock del logger de errores

### Config Tests

#### `envs.spec.ts`
**Cubre**: Validación de variables de entorno

**Casos de prueba**:
- ✅ Validación de variables requeridas
- ✅ Validación de tipos (números, strings, booleanos)
- ✅ Validación de formatos (URLs, emails, etc.)
- ✅ Validación de rangos (min/max)
- ✅ Errores descriptivos cuando falta configuración

**Características especiales**:
- Tests de esquemas Zod
- Validación de todos los grupos de configuración

#### `config-factory.spec.ts`
**Cubre**: Funciones factory de configuración

**Casos de prueba**:
- ✅ `createServerConfig()` - Creación de configuración de servidor
- ✅ `createDatabaseConfig()` - Creación de configuración de base de datos
- ✅ `createBatchWorkerConfig()` - Creación de configuración de batch worker
- ✅ `createBufferConfig()` - Creación de configuración de buffer
- ✅ `createRetentionConfig()` - Creación de configuración de retención
- ✅ `createQueryConfig()` - Creación de configuración de consultas
- ✅ `createServiceConfig()` - Creación de configuración de servicio
- ✅ `createValidationConfig()` - Creación de configuración de validación
- ✅ `createCheckpointConfig()` - Creación de configuración de checkpoint
- ✅ `createCircuitBreakerConfig()` - Creación de configuración de circuit breaker
- ✅ `createShutdownConfig()` - Creación de configuración de shutdown
- ✅ `createMetricsConfig()` - Creación de configuración de métricas con valores por defecto
- ✅ `createRateLimitingConfig()` - Creación de configuración de rate limiting
- ✅ Validación de tipos de retorno
- ✅ Verificación de valores por defecto en métricas

---

## Tests E2E

Los tests E2E validan flujos completos mediante peticiones HTTP reales al servidor.

### `business-metrics.e2e-spec.ts`
**Endpoints probados**:
- `GET /health/business` - Métricas de negocio
- Validación de estructura de respuesta
- Validación de cálculos

### `correlation-id.e2e-spec.ts`
**Funcionalidad probada**:
- Generación automática de Correlation ID
- Propagación en headers
- Inclusión en logs

### `rate-limiting.e2e-spec.ts`
**Funcionalidad probada**:
- Rate limiting por IP
- Respuesta 429 cuando se excede límite
- Headers de retry-after

### `sanitization.e2e-spec.ts`
**Funcionalidad probada**:
- Sanitización de inputs en endpoints
- Prevención de XSS
- Validación de longitudes

---

## Ejecución de Tests

### Todos los Tests

```bash
# Ejecutar todos los tests (unitarios + E2E)
npm run test

# Con coverage
npm run test:cov

# En modo watch
npm run test:watch
```

### Solo Tests Unitarios

```bash
# Tests unitarios
npm run test:unit

# Coverage de tests unitarios
npm run test:unit:cov
```

### Solo Tests E2E

```bash
# Tests E2E (requiere aplicación corriendo)
npm run test:e2e

# O con Docker y app iniciada automáticamente
npm run test:e2e:docker
```

### Tests Específicos

```bash
# Ejecutar un archivo específico
npm run test -- events.service.spec.ts

# Ejecutar tests que coincidan con un patrón
npm run test -- --testNamePattern="EventService"
```

### Opciones Avanzadas

```bash
# Verbose output
npm run test -- --verbose

# Solo mostrar errores
npm run test -- --silent

# Detectar tests no cubiertos
npm run test -- --findRelatedTests
```

---

## Estrategia de Testing

### Principios

1. **Aislamiento**: Cada test es independiente y no depende de otros
2. **Rapidez**: Tests unitarios deben ejecutarse rápidamente (< 1s total)
3. **Determinismo**: Tests deben dar el mismo resultado siempre
4. **Cobertura**: Máxima cobertura de lógica de negocio
5. **Mocks**: Dependencias externas (BD, filesystem) se mockean

### Estructura de Tests

Cada archivo de test sigue esta estructura:

```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  let mockDependency: MockType;

  beforeEach(() => {
    // Setup: crear mocks e instanciar servicio
  });

  describe('methodName()', () => {
    it('should do something when condition', async () => {
      // Arrange: preparar datos
      // Act: ejecutar método
      // Assert: validar resultado
    });

    it('should handle error when something fails', async () => {
      // Test de manejo de errores
    });
  });
});
```

### Mocks y Stubs

**Estrategia**:
- **Repositorios**: Siempre mockeados (no tocan BD real)
- **Servicios externos**: Mockeados para aislamiento
- **Utilidades**: Pueden probarse directamente si son puras
- **FileSystem**: Mockeado o usando archivos temporales

**Herramientas**:
- Jest mocks (`jest.mock()`, `jest.fn()`)
- Manual mocks para dependencias complejas

### Cobertura Objetivo

- **Servicios**: 80%+ cobertura
- **Controladores**: 70%+ cobertura (lógica importante)
- **Repositorios**: 80%+ cobertura
- **Utils**: 90%+ cobertura

### Tests de Integración vs Unitarios

- **Unitarios**: Servicios y lógica de negocio (rápidos, aislados)
- **E2E**: Flujos completos HTTP (más lentos, requieren app corriendo)

---

## Mejores Prácticas

### ✅ Hacer

- Escribir tests para toda la lógica de negocio
- Usar nombres descriptivos para tests (`should calculate total when events exist`)
- Testear casos edge (null, undefined, arrays vacíos)
- Mockear dependencias externas
- Limpiar recursos después de tests (archivos temporales, etc.)
- Agrupar tests relacionados con `describe()`

### ❌ Evitar

- Tests que dependen de otros tests
- Tests que tocan base de datos real en unitarios
- Tests flaky (que pasan o fallan aleatoriamente)
- Tests que no validan nada (sin `expect()`)
- Tests demasiado complejos (mejor dividirlos)

---

## Troubleshooting

### Tests Falla

1. **Verificar que todas las dependencias estén instaladas**:
   ```bash
   npm install
   ```

2. **Limpiar cache de Jest**:
   ```bash
   npm run test -- --clearCache
   ```

3. **Ejecutar con verbose para más detalles**:
   ```bash
   npm run test -- --verbose
   ```

### Tests E2E Falla

1. **Verificar que la aplicación esté corriendo**:
   ```bash
   npm run start:dev
   ```

2. **Verificar que PostgreSQL esté corriendo**:
   ```bash
   docker-compose ps
   ```

3. **Verificar variables de entorno en `.env`**

### Coverage Bajo

1. **Identificar archivos sin coverage**:
   ```bash
   npm run test:cov
   ```

2. **Revisar reporte HTML**:
   - Abrir `coverage/index.html` en el navegador

3. **Agregar tests para métodos sin cubrir**

---

## Resumen de Cobertura

### Estadísticas de Tests

- **Total de archivos de test**: 37
- **Tests unitarios**: ~200+ casos de prueba
- **Tests E2E**: 4 suites completas
- **Cobertura objetivo**: 80%+ para servicios, 70%+ para controladores

### Archivos con Tests

**Controladores** (3):
- ✅ `app.controller.spec.ts` - Health checks (health, liveness, readiness)
- ✅ `events.controller.spec.ts` - Ingesta y consulta
- ✅ `event-health.controller.spec.ts` - Health endpoints

**Servicios** (12):
- ✅ Todos los servicios tienen tests completos

**Repositorios** (3):
- ✅ `typeorm-event.repository.spec.ts`
- ✅ `typeorm-business-metrics.repository.spec.ts`
- ✅ `file-metrics.repository.spec.ts`

**DTOs** (6):
- ✅ Todos los DTOs tienen tests de validación

**Decoradores** (4):
- ✅ Todos los decoradores personalizados tienen tests

**Guards, Middleware, Utils** (5):
- ✅ Todos tienen tests completos

**Config** (2):
- ✅ `envs.spec.ts`
- ✅ `config-factory.spec.ts`

---

## Referencias

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

