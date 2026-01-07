# 📋 Lista de Mejoras Pendientes - Aurore Events MVP

## ✅ Completado

1. **✅ ConfigModule creado** - Módulo de configuración con inyección de dependencias
   - Interfaces de configuración para cada grupo
   - Tokens de inyección
   - Factory functions
   - Documentación completa

---

## 🔴 Prioridad Alta (Impacto Crítico)

### 1. **Migrar Servicios a ConfigModule** ⚠️

**Servicios que aún usan `envs` directamente:**

- ❌ `CircuitBreakerService` - Usa `envs.circuitBreaker*`
- ❌ `EventBufferService` - Usa `envs.bufferMaxSize`, `envs.checkpointIntervalMs`
- ❌ `BatchWorkerService` - Usa `envs.batchSize`, `envs.drainInterval`, `envs.maxRetries`, `envs.shutdownTimeoutMs`
- ❌ `RetentionService` - Usa `envs.retentionDays`, `envs.retentionCronSchedule`
- ❌ `EventService` - Usa `envs.retryAfterSeconds`, `envs.maxQueryLimit`
- ❌ `BusinessMetricsService` - Usa valores hardcodeados (CACHE_TTL_MS)
- ❌ `MetricsPersistenceService` - Usa valores hardcodeados (PERSISTENCE_INTERVAL_MS)

**Impacto:**
- Mejora testabilidad
- Reduce acoplamiento
- Facilita cambios de configuración

**Esfuerzo:** 2-3 días

---

### 2. **Usar Interfaces como Tokens de Inyección** ⚠️

**Problema actual:**
- ❌ `EventService` inyecta `EventService` directamente (no usa `IEventService`)
- ❌ `EventBufferService` se inyecta como clase concreta (no usa `IEventBufferService`)
- ❌ `BatchWorkerService` inyecta servicios concretos
- ❌ `RetentionService` inyecta `EventService` directamente

**Mejora requerida:**
- Crear tokens de inyección para todas las interfaces:
  - `EVENT_SERVICE_TOKEN`
  - `EVENT_BUFFER_SERVICE_TOKEN`
  - `BATCH_WORKER_SERVICE_TOKEN`
  - `RETENTION_SERVICE_TOKEN`
- Actualizar providers en módulos
- Actualizar constructores de servicios

**Impacto:**
- Mayor flexibilidad
- Mejor testabilidad
- Permite múltiples implementaciones

**Esfuerzo:** 3-4 días

---

### 3. **Separar BusinessMetricsService del ORM** ⚠️

**Problema actual:**
```typescript
// ❌ Acoplamiento directo con TypeORM
@InjectRepository(Event)
private readonly eventRepository: Repository<Event>
```

**Mejora requerida:**
- Crear `IBusinessMetricsRepository` interface
- Crear `TypeOrmBusinessMetricsRepository` implementation
- Mover queries SQL al repositorio
- Inyectar repositorio abstracto en el servicio

**Impacto:**
- Permite cambiar ORM sin modificar servicio
- Mejor testabilidad
- Cumple Dependency Inversion Principle

**Esfuerzo:** 1-2 días

---

## 🟡 Prioridad Media (Impacto Moderado)

### 4. **Extraer CheckpointService de EventBufferService** 📦

**Problema actual:**
- `EventBufferService` tiene demasiadas responsabilidades:
  - Gestión del buffer en memoria
  - Checkpointing (persistencia en disco)
  - Validación de eventos
  - Métricas del buffer

**Mejora requerida:**
- Crear `CheckpointService` o `ICheckpointRepository`
- Mover lógica de checkpointing fuera de `EventBufferService`
- Inyectar `ICheckpointRepository` en `EventBufferService`

**Responsabilidades del nuevo servicio:**
- `saveCheckpoint(events: EnrichedEvent[])`
- `loadCheckpoint(): Promise<EnrichedEvent[]>`
- `deleteCheckpoint()`

**Impacto:**
- Cumple Single Responsibility Principle
- Más fácil de testear
- Permite cambiar implementación de checkpointing

**Esfuerzo:** 2-3 días

---

### 5. **Extraer Métricas del Buffer a Servicio Separado** 📊

**Problema actual:**
- `EventBufferService.getMetrics()` calcula métricas internamente
- Mezcla lógica de negocio con cálculo de métricas

**Mejora requerida:**
- Crear `BufferMetricsService`
- Mover cálculo de métricas fuera de `EventBufferService`
- `EventBufferService` solo expone datos, no cálculos

**Impacto:**
- Separación de responsabilidades
- Métricas reutilizables
- Más fácil de extender

**Esfuerzo:** 1-2 días

---

### 6. **Convertir Utilidades Estáticas en Servicios** 🔧

**Utilidades actuales:**
- ❌ `ErrorLogger` - Clase estática
- ❌ `Sanitizer` - Clase estática

**Mejora requerida:**
- Crear `ErrorLoggerService` con interfaz `IErrorLogger`
- Crear `SanitizerService` con interfaz `ISanitizer`
- Actualizar todos los servicios que los usan
- Registrar como providers en módulos

**Servicios que usan utilidades estáticas:**
- `CircuitBreakerService` → `ErrorLogger`
- `EventService` → `Sanitizer`, `ErrorLogger`
- `EventBufferService` → `ErrorLogger`
- `BatchWorkerService` → `ErrorLogger`
- `RetentionService` → `ErrorLogger`
- `BusinessMetricsService` → `ErrorLogger`
- `MetricsPersistenceService` → `ErrorLogger`

**Impacto:**
- Mejor testabilidad
- Permite diferentes implementaciones
- Inyección de dependencias consistente

**Esfuerzo:** 2-3 días

---

### 7. **Mover Valores Hardcodeados a Configuración** ⚙️

**Valores hardcodeados encontrados:**

```typescript
// ❌ BusinessMetricsService
private readonly CACHE_TTL_MS = 60000; // 1 minuto

// ❌ MetricsPersistenceService
private readonly PERSISTENCE_INTERVAL_MS = 60000; // 1 minuto

// ❌ createMetricsConfig (config-factory.ts)
cacheTtlMs: 60000, // 1 minute default
persistenceIntervalMs: 60000, // 1 minute default
```

**Mejora requerida:**
- Agregar variables de entorno:
  - `BUSINESS_METRICS_CACHE_TTL_MS`
  - `METRICS_PERSISTENCE_INTERVAL_MS`
- Actualizar `envs.ts` con validación
- Usar en `MetricsConfig` interface
- Actualizar servicios

**Impacto:**
- Configuración centralizada
- Permite diferentes valores por ambiente
- Más flexible

**Esfuerzo:** 1 día

---

## 🟢 Prioridad Baja (Mejoras Incrementales)

### 8. **Crear Interfaces para Operaciones de Lectura del Buffer** 📖

**Problema actual:**
- `BatchWorkerService` conoce detalles de implementación del buffer

**Mejora requerida:**
- Crear `IBufferReader` interface:
  ```typescript
  interface IBufferReader {
    drain(batchSize: number): EnrichedEvent[];
    getSize(): number;
    getCapacity(): number;
    isFull(): boolean;
  }
  ```
- `EventBufferService` implementa `IBufferReader`
- `BatchWorkerService` usa `IBufferReader` en lugar de `EventBufferService`

**Impacto:**
- Mejor separación de concerns
- Permite diferentes implementaciones de buffer

**Esfuerzo:** 1 día

---

### 9. **Reorganizar Estructura de Módulos** 🏗️

**Mejora requerida:**
- Crear módulos de abstracción compartidos
- Separar concerns de persistencia de lógica de negocio
- Considerar arquitectura en capas más explícita

**Estructura propuesta:**
```
modules/
├── domain/           # Lógica de negocio pura
├── application/      # Casos de uso / servicios de aplicación
├── infrastructure/   # Persistencia, externos, etc.
└── common/          # Utilidades compartidas
```

**Impacto:**
- Mejor organización
- Evita dependencias circulares
- Más escalable

**Esfuerzo:** 5-7 días (refactor grande)

---

### 10. **Implementar Factory Pattern para Servicios Complejos** 🏭

**Mejora requerida:**
- Crear factories para servicios con múltiples dependencias
- Simplificar creación de servicios complejos en tests

**Impacto:**
- Código más limpio
- Tests más simples

**Esfuerzo:** 2-3 días

---

## 📊 Resumen por Prioridad

### Prioridad Alta (3 tareas)
1. ✅ ~~ConfigModule creado~~
2. 🔴 Migrar servicios a ConfigModule
3. 🔴 Usar interfaces como tokens de inyección
4. 🔴 Separar BusinessMetricsService del ORM

**Esfuerzo total:** ~6-9 días

### Prioridad Media (4 tareas)
5. 🟡 Extraer CheckpointService
6. 🟡 Extraer métricas del buffer
7. 🟡 Convertir utilidades estáticas
8. 🟡 Mover valores hardcodeados

**Esfuerzo total:** ~6-9 días

### Prioridad Baja (3 tareas)
9. 🟢 Interfaces para lectura del buffer
10. 🟢 Reorganizar estructura de módulos
11. 🟢 Factory pattern

**Esfuerzo total:** ~8-11 días

---

## 🎯 Plan de Acción Recomendado

### Fase 1: Desacoplamiento Crítico (Semanas 1-2)
1. Migrar servicios a ConfigModule (prioridad: CircuitBreakerService, EventBufferService, BatchWorkerService)
2. Crear tokens de inyección para interfaces principales
3. Actualizar providers en módulos

### Fase 2: Separación de Responsabilidades (Semana 3)
4. Separar BusinessMetricsService del ORM
5. Extraer CheckpointService
6. Convertir utilidades estáticas

### Fase 3: Configuración y Optimización (Semana 4)
7. Mover valores hardcodeados a configuración
8. Extraer métricas del buffer
9. Crear interfaces para lectura del buffer

### Fase 4: Arquitectura (Semanas 5-6)
10. Reorganizar estructura de módulos
11. Implementar Factory pattern

---

## 📈 Métricas de Progreso

| Categoría | Total | Completado | Pendiente | % |
|-----------|-------|------------|-----------|---|
| **Prioridad Alta** | 4 | 1 | 3 | 25% |
| **Prioridad Media** | 4 | 0 | 4 | 0% |
| **Prioridad Baja** | 3 | 0 | 3 | 0% |
| **TOTAL** | **11** | **1** | **10** | **9%** |

---

## 🚀 Próximos Pasos Inmediatos

1. **Migrar CircuitBreakerService a ConfigModule** (ejemplo completo)
2. **Crear tokens de inyección para EventService y EventBufferService**
3. **Documentar proceso de migración para otros desarrolladores**

---

## 📝 Notas

- Todas las mejoras deben implementarse de forma incremental
- Priorizar servicios más críticos y más acoplados
- Mantener compatibilidad hacia atrás durante la refactorización
- Agregar tests antes de refactorizar (test-driven refactoring)
- Documentar interfaces y contratos claramente

