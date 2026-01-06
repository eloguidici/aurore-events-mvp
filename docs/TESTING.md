# Documentación de Testing - Aurore Events MVP

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
| **Event Module** | | |
| | `events.service.spec.ts` | EventService - lógica de negocio |
| | `event-buffer.service.spec.ts` | EventBufferService - buffer y checkpoints |
| | `business-metrics.service.spec.ts` | BusinessMetricsService - cálculos de métricas |
| | `metrics-persistence.service.spec.ts` | MetricsPersistenceService - persistencia |
| | `typeorm-event.repository.spec.ts` | TypeOrmEventRepository - acceso a datos |
| **Batch Worker** | `batch-worker.service.spec.ts` | BatchWorkerService - procesamiento por lotes |
| **Retention** | `retention.service.spec.ts` | RetentionService - limpieza automática |
| **Common Module** | | |
| | `circuit-breaker.service.spec.ts` | CircuitBreakerService - protección contra fallos |
| | `sanitizer.spec.ts` | Sanitizer - sanitización de inputs |
| **Config** | `envs.spec.ts` | Validación de variables de entorno |

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

## Referencias

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

