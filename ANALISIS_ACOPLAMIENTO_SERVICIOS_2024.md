# Análisis de Acoplamiento en Servicios - Aurore Events MVP

**Fecha:** 2024  
**Alcance:** Todos los servicios en `src/modules`

---

## 📊 Resumen Ejecutivo

Se analizaron **10 servicios** y se identificaron **problemas de acoplamiento** y oportunidades de mejora. El análisis se enfoca en:
- Dependencias directas entre servicios (sin interfaces)
- Acoplamiento con implementaciones concretas
- Violaciones de principios SOLID
- Múltiples responsabilidades en servicios

---

## 🔴 Problemas Críticos Identificados

### 1. Dependencias Directas sin Interfaces

#### ❌ `RetentionService` → `EventService`
**Ubicación:** `src/modules/retention/services/retention.service.ts:18`

```typescript
// ❌ PROBLEMA: Dependencia directa a implementación concreta
constructor(
  private readonly eventService: EventService,  // Debería ser IEventService
  // ...
)
```

**Impacto:**
- Imposible mockear `EventService` en tests sin importar la clase completa
- No permite múltiples implementaciones
- Violación de Dependency Inversion Principle

**Solución:**
```typescript
// ✅ SOLUCIÓN: Usar interfaz con token de inyección
@Inject(EVENT_SERVICE_TOKEN)
private readonly eventService: IEventService,
```

---

#### ❌ `EventService` → `EventBufferService`
**Ubicación:** `src/modules/event/services/events.service.ts:32`

```typescript
// ❌ PROBLEMA: Aunque existe IEventBufferService, se inyecta la clase concreta
constructor(
  @Inject(EVENT_REPOSITORY_TOKEN)
  private readonly eventRepository: IEventRepository,
  private readonly eventBufferService: EventBufferService,  // Debería usar interfaz
  // ...
)
```

**Impacto:**
- Existe la interfaz `IEventBufferService` pero no se usa
- Acoplamiento innecesario con implementación concreta

**Solución:**
```typescript
// ✅ SOLUCIÓN: Crear token e inyectar interfaz
@Inject(EVENT_BUFFER_SERVICE_TOKEN)
private readonly eventBufferService: IEventBufferService,
```

---

#### ❌ `BatchWorkerService` → Múltiples servicios
**Ubicación:** `src/modules/batch-worker/services/batch-worker.service.ts:32-34`

```typescript
// ❌ PROBLEMA: Dependencias directas a implementaciones concretas
constructor(
  private readonly eventBufferService: EventBufferService,  // Debería usar interfaz
  private readonly eventService: EventService,  // Debería usar interfaz
  private readonly metricsCollector: MetricsCollectorService,  // OK (no hay interfaz)
  // ...
)
```

**Impacto:**
- Múltiples dependencias directas
- Dificulta testing y cambios de implementación

**Solución:**
```typescript
// ✅ SOLUCIÓN: Usar interfaces con tokens
@Inject(EVENT_BUFFER_SERVICE_TOKEN)
private readonly eventBufferService: IEventBufferService,

@Inject(EVENT_SERVICE_TOKEN)
private readonly eventService: IEventService,
```

---

#### ❌ `MetricsPersistenceService` → Múltiples servicios
**Ubicación:** `src/modules/event/services/metrics-persistence.service.ts:27-28`

```typescript
// ❌ PROBLEMA: Dependencias directas para obtener métricas
constructor(
  private readonly eventBufferService: EventBufferService,  // Debería usar interfaz
  private readonly circuitBreaker: CircuitBreakerService,  // Debería usar interfaz
  // ...
)
```

**Impacto:**
- Acoplamiento fuerte para solo obtener métricas
- Debería usar interfaces o un servicio de métricas agregado

**Solución:**
```typescript
// ✅ SOLUCIÓN 1: Usar interfaces
@Inject(EVENT_BUFFER_SERVICE_TOKEN)
private readonly eventBufferService: IEventBufferService,

@Inject(CIRCUIT_BREAKER_SERVICE_TOKEN)
private readonly circuitBreaker: ICircuitBreakerService,

// ✅ SOLUCIÓN 2 (mejor): Crear servicio agregado de métricas
@Inject(METRICS_AGGREGATOR_TOKEN)
private readonly metricsAggregator: IMetricsAggregatorService,
```

---

#### ❌ `ErrorHandlingService` → `HealthService`
**Ubicación:** `src/modules/common/services/error-handling.service.ts:10`

```typescript
// ❌ PROBLEMA: Dependencia directa aunque existe IHealthService
constructor(private readonly healthService: HealthService) {}
```

**Impacto:**
- Existe `IHealthService` pero no se usa
- Acoplamiento innecesario

**Solución:**
```typescript
// ✅ SOLUCIÓN: Usar interfaz con token
@Inject(HEALTH_SERVICE_TOKEN)
private readonly healthService: IHealthService,
```

---

#### ❌ `TypeOrmEventRepository` → `CircuitBreakerService`
**Ubicación:** `src/modules/event/repositories/typeorm-event.repository.ts:26`

```typescript
// ❌ PROBLEMA: Dependencia directa aunque existe ICircuitBreakerService
@Inject(CircuitBreakerService)
private readonly circuitBreaker: CircuitBreakerService,
```

**Impacto:**
- Existe `ICircuitBreakerService` pero no se usa
- Acoplamiento innecesario

**Solución:**
```typescript
// ✅ SOLUCIÓN: Usar interfaz con token
@Inject(CIRCUIT_BREAKER_SERVICE_TOKEN)
private readonly circuitBreaker: ICircuitBreakerService,
```

---

### 2. Acoplamiento con TypeORM

#### ❌ `BusinessMetricsService` → `Repository<Event>`
**Ubicación:** `src/modules/event/services/business-metrics.service.ts:52-53`

```typescript
// ❌ PROBLEMA: Acoplamiento directo con TypeORM
constructor(
  @InjectRepository(Event)
  private readonly eventRepository: Repository<Event>,
  // ...
)
```

**Impacto:**
- Imposible cambiar ORM sin modificar el servicio
- Tests requieren mockear TypeORM
- Violación de Dependency Inversion Principle
- Ya existe `IEventRepository` que podría usarse

**Solución:**
```typescript
// ✅ SOLUCIÓN: Usar repositorio abstracto o crear interfaz específica
@Inject(EVENT_REPOSITORY_TOKEN)
private readonly eventRepository: IEventRepository,

// O crear IBusinessMetricsRepository con métodos específicos:
// - getTotalEventsCount()
// - getEventsByService()
// - getEventsByTimeRange()
// - getEventsByHour()
```

---

### 3. Múltiples Responsabilidades (SRP Violations)

#### ⚠️ `EventBufferService` - Demasiadas responsabilidades
**Ubicación:** `src/modules/event/services/event-buffer.service.ts`

**Responsabilidades actuales:**
1. ✅ Gestión del buffer en memoria (core)
2. ⚠️ Checkpointing (persistencia/recuperación en disco)
3. ⚠️ Validación de eventos (método `isValid()`)
4. ⚠️ Cálculo de métricas (método `getMetrics()`)

**Problema:**
- El servicio tiene ~800 líneas
- Mezcla lógica de buffer, persistencia, validación y métricas
- Dificulta testing y mantenimiento

**Solución propuesta:**
```typescript
// Separar en:
1. EventBufferService - Solo gestión del buffer (enqueue, drain, getSize)
2. CheckpointService - Persistencia/recuperación de checkpoints
3. BufferMetricsService - Cálculo de métricas del buffer
4. EventValidatorService - Validación de eventos (o usar DTO validation)
```

---

#### ⚠️ `EventService` - Múltiples responsabilidades
**Ubicación:** `src/modules/event/services/events.service.ts`

**Responsabilidades actuales:**
1. ✅ Enriquecimiento de eventos (`enrich()`)
2. ⚠️ Validación de timestamps (`validateAndNormalizeTimestamp()`)
3. ⚠️ Sanitización (`Sanitizer.sanitizeString()`)
4. ✅ Ingestión (`ingest()`)
5. ✅ Inserción batch (`insert()`)
6. ✅ Búsqueda (`search()`)
7. ✅ Limpieza (`cleanup()`)

**Análisis:**
- La mayoría de responsabilidades son relacionadas (eventos)
- Validación y sanitización podrían extraerse
- Enriquecimiento podría ser un servicio separado

**Solución propuesta (opcional):**
```typescript
// Considerar separar solo si crece mucho:
1. EventEnrichmentService - Enriquecimiento y validación
2. EventQueryService - Búsqueda y paginación (si crece)
3. EventService - Orquestación principal
```

---

#### ⚠️ `BusinessMetricsService` - Mezcla lógica y acceso a datos
**Ubicación:** `src/modules/event/services/business-metrics.service.ts`

**Responsabilidades actuales:**
1. ⚠️ Consultas SQL complejas (acceso a datos)
2. ✅ Cacheo de resultados
3. ✅ Transformación de datos
4. ✅ Cálculo de métricas

**Problema:**
- Mezcla acceso a datos (SQL) con lógica de negocio
- Dificulta testing sin base de datos

**Solución propuesta:**
```typescript
// Separar en:
1. BusinessMetricsRepository - Acceso a datos (queries SQL)
2. BusinessMetricsService - Lógica de negocio, cacheo, transformación
```

---

### 4. Utilidades Estáticas (No Inyectables)

#### ⚠️ `ErrorLogger` - Clase estática
**Ubicación:** `src/modules/common/utils/error-logger.ts`

**Problema:**
- Se usa como clase estática: `ErrorLogger.logError(...)`
- No es inyectable, dificulta testing y mockeo
- No permite diferentes implementaciones

**Uso actual:**
```typescript
// ❌ Uso estático en múltiples servicios
ErrorLogger.logError(this.logger, 'Error message', error, context);
```

**Solución propuesta:**
```typescript
// ✅ Convertir a servicio inyectable
@Injectable()
export class ErrorLoggerService {
  logError(logger: Logger, message: string, error: unknown, context?: any): void {
    // ...
  }
  // ...
}
```

---

#### ⚠️ `Sanitizer` - Clase estática
**Ubicación:** `src/modules/common/utils/sanitizer.ts`

**Problema:**
- Se usa como clase estática: `Sanitizer.sanitizeString(...)`
- No es inyectable

**Uso actual:**
```typescript
// ❌ Uso estático en EventService
const sanitizedService = Sanitizer.sanitizeString(createEventDto.service);
```

**Solución propuesta:**
```typescript
// ✅ Convertir a servicio inyectable
@Injectable()
export class SanitizerService {
  sanitizeString(input: string): string {
    // ...
  }
  // ...
}
```

---

## 🟡 Problemas Menores

### 5. Métodos Públicos que Deberían ser Privados

#### `EventBufferService.getCapacity()` y `isFull()`
- Son métodos públicos pero solo se usan internamente
- Considerar hacerlos privados o documentar su uso público

---

### 6. Falta de Tokens de Inyección

**Tokens faltantes:**
- `EVENT_SERVICE_TOKEN`
- `EVENT_BUFFER_SERVICE_TOKEN`
- `BATCH_WORKER_SERVICE_TOKEN`
- `RETENTION_SERVICE_TOKEN`
- `HEALTH_SERVICE_TOKEN`
- `CIRCUIT_BREAKER_SERVICE_TOKEN`
- `METRICS_COLLECTOR_SERVICE_TOKEN` (si se crea interfaz)

---

## ✅ Aspectos Positivos

1. **ConfigModule bien implementado** - Todos los servicios usan configuración inyectada
2. **Interfaces existentes** - Ya existen muchas interfaces (`IEventService`, `IEventBufferService`, etc.)
3. **Repositorios abstractos** - Se usan tokens para repositorios (`EVENT_REPOSITORY_TOKEN`)
4. **Separación de módulos** - Buena organización por módulos

---

## 📋 Plan de Acción Recomendado

### Fase 1: Tokens de Inyección (Prioridad Alta) - 2-3 días

1. Crear tokens para todas las interfaces existentes:
   ```typescript
   // src/modules/event/services/interfaces/event-service.token.ts
   export const EVENT_SERVICE_TOKEN = Symbol('EVENT_SERVICE');
   
   // src/modules/event/services/interfaces/event-buffer-service.token.ts
   export const EVENT_BUFFER_SERVICE_TOKEN = Symbol('EVENT_BUFFER_SERVICE');
   
   // src/modules/common/services/interfaces/circuit-breaker-service.token.ts
   export const CIRCUIT_BREAKER_SERVICE_TOKEN = Symbol('CIRCUIT_BREAKER_SERVICE');
   
   // src/modules/common/services/interfaces/health-service.token.ts
   export const HEALTH_SERVICE_TOKEN = Symbol('HEALTH_SERVICE');
   ```

2. Actualizar providers en módulos:
   ```typescript
   // event.module.ts
   {
     provide: EVENT_SERVICE_TOKEN,
     useClass: EventService,
   },
   {
     provide: EVENT_BUFFER_SERVICE_TOKEN,
     useClass: EventBufferService,
   },
   ```

3. Actualizar constructores de servicios para usar tokens

---

### Fase 2: Refactorizar Dependencias Directas (Prioridad Alta) - 3-4 días

1. **RetentionService:**
   - Cambiar `EventService` → `IEventService` con token

2. **EventService:**
   - Cambiar `EventBufferService` → `IEventBufferService` con token

3. **BatchWorkerService:**
   - Cambiar `EventBufferService` → `IEventBufferService` con token
   - Cambiar `EventService` → `IEventService` con token

4. **MetricsPersistenceService:**
   - Cambiar `EventBufferService` → `IEventBufferService` con token
   - Cambiar `CircuitBreakerService` → `ICircuitBreakerService` con token

5. **ErrorHandlingService:**
   - Cambiar `HealthService` → `IHealthService` con token

6. **TypeOrmEventRepository:**
   - Cambiar `CircuitBreakerService` → `ICircuitBreakerService` con token

---

### Fase 3: Desacoplar BusinessMetricsService del ORM (Prioridad Media) - 2-3 días

1. Crear `IBusinessMetricsRepository` interface:
   ```typescript
   export interface IBusinessMetricsRepository {
     getTotalEventsCount(): Promise<number>;
     getEventsByService(): Promise<ServiceCountRow[]>;
     getEventsByTimeRange(from: Date, to: Date): Promise<number>;
     getEventsByHour(from: Date): Promise<HourlyCountRow[]>;
   }
   ```

2. Crear implementación TypeORM:
   ```typescript
   @Injectable()
   export class TypeOrmBusinessMetricsRepository implements IBusinessMetricsRepository {
     // Implementar métodos usando TypeORM
   }
   ```

3. Actualizar `BusinessMetricsService` para usar la interfaz

---

### Fase 4: Convertir Utilidades a Servicios (Prioridad Media) - 2-3 días

1. Convertir `ErrorLogger` → `ErrorLoggerService`
2. Convertir `Sanitizer` → `SanitizerService`
3. Actualizar todos los servicios que las usan
4. Actualizar tests

---

### Fase 5: Separar Responsabilidades (Prioridad Baja) - 5-7 días

1. **Extraer CheckpointService de EventBufferService:**
   - Crear `CheckpointService` con métodos de checkpoint
   - `EventBufferService` inyecta `CheckpointService`
   - Reducir tamaño de `EventBufferService`

2. **Extraer BufferMetricsService (opcional):**
   - Si las métricas crecen, extraer a servicio separado

3. **Extraer BusinessMetricsRepository (ya en Fase 3)**

---

## 📊 Métricas de Éxito

- ✅ **100% de servicios usando interfaces** (actualmente ~60%)
- ✅ **0 dependencias directas a implementaciones concretas** (actualmente ~6)
- ✅ **100% de configuración inyectada** (ya completado ✅)
- ✅ **Servicios testables sin mocks complejos**
- ✅ **Cumplimiento de SRP y DIP en todos los servicios**

---

## 🎯 Priorización

### 🔴 Crítico (Hacer primero)
1. Crear tokens de inyección
2. Refactorizar dependencias directas a interfaces

### 🟡 Importante (Hacer después)
3. Desacoplar BusinessMetricsService del ORM
4. Convertir utilidades estáticas a servicios

### 🟢 Mejora (Opcional, si hay tiempo)
5. Separar responsabilidades en servicios grandes

---

## 📝 Notas

- Las mejoras deben implementarse de forma incremental
- Priorizar servicios más críticos y más acoplados
- Mantener compatibilidad hacia atrás durante la refactorización
- Agregar tests antes de refactorizar (test-driven refactoring)
- Documentar interfaces y contratos claramente

---

## 🔍 Servicios Analizados

| Servicio | Líneas | Dependencias Directas | Interfaces Usadas | Problemas |
|----------|--------|----------------------|-------------------|-----------|
| `EventService` | 289 | 1 (EventBufferService) | ✅ IEventRepository | 🟡 Usar interfaz para buffer |
| `EventBufferService` | 798 | 0 | ❌ Ninguna | 🔴 Múltiples responsabilidades |
| `BusinessMetricsService` | 268 | 1 (TypeORM Repository) | ❌ Ninguna | 🔴 Acoplamiento con ORM |
| `MetricsPersistenceService` | 148 | 2 (EventBuffer, CircuitBreaker) | ✅ IMetricsRepository | 🟡 Usar interfaces |
| `RetentionService` | 90 | 1 (EventService) | ❌ Ninguna | 🔴 Usar interfaz |
| `BatchWorkerService` | 443 | 2 (EventBuffer, EventService) | ❌ Ninguna | 🔴 Usar interfaces |
| `CircuitBreakerService` | 194 | 0 | ✅ ICircuitBreakerService | ✅ OK |
| `HealthService` | 152 | 0 | ✅ IHealthService | ✅ OK |
| `MetricsCollectorService` | 143 | 0 | ❌ Ninguna | 🟡 Considerar interfaz |
| `ErrorHandlingService` | 103 | 1 (HealthService) | ❌ Ninguna | 🟡 Usar interfaz |

**Total:** 10 servicios analizados  
**Problemas críticos:** 6 servicios  
**Problemas menores:** 4 servicios

