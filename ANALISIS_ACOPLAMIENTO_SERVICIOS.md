# Análisis de Acoplamiento en Servicios - Aurore Events MVP

## Resumen Ejecutivo

Este documento presenta un análisis detallado del acoplamiento en todos los servicios del proyecto `src/modules` y propone mejoras para reducir las dependencias fuertes y mejorar la mantenibilidad.

---

## 🔴 Problemas Críticos de Acoplamiento

### 1. **Acceso Directo a Configuración Global (`envs`)**

**Ubicación:** Múltiples servicios acceden directamente a `envs`

**Servicios afectados:**
- `CircuitBreakerService`
- `EventBufferService`
- `EventService`
- `BatchWorkerService`
- `RetentionService`
- `MetricsPersistenceService`

**Problema:**
```typescript
// ❌ Acoplamiento fuerte con configuración global
constructor() {
  this.config = {
    failureThreshold: envs.circuitBreakerFailureThreshold,
    // ...
  };
}
```

**Impacto:**
- Imposible testear sin variables de entorno configuradas
- Difícil cambiar configuración en runtime
- No permite diferentes configuraciones por instancia
- Violación de Dependency Inversion Principle (SOLID)

**Mejora recomendada:**
```typescript
// ✅ Inyección de configuración
interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
}

constructor(
  @Inject('CIRCUIT_BREAKER_CONFIG')
  private readonly config: CircuitBreakerConfig
) {}
```

---

### 2. **Dependencia Directa en Implementación de TypeORM**

**Servicio:** `BusinessMetricsService`

**Problema:**
```typescript
// ❌ Acoplamiento directo con TypeORM
constructor(
  @InjectRepository(Event)
  private readonly eventRepository: Repository<Event>,
) {}
```

**Impacto:**
- Imposible cambiar ORM sin modificar el servicio
- Tests requieren mockear TypeORM
- Violación de Dependency Inversion Principle

**Mejora recomendada:**
- Usar el repositorio abstracto ya existente (`IEventRepository`) o crear una interfaz específica para métricas

---

### 3. **Dependencias Directas entre Servicios sin Abstracción**

**Servicios afectados:**

#### a) `ErrorHandlingService` → `HealthService`
```typescript
// ❌ Dependencia directa
constructor(private readonly healthService: HealthService) {}
```

#### b) `EventService` → `EventBufferService`
```typescript
// ❌ Aunque hay interfaz, se inyecta la implementación directa
constructor(
  private readonly eventBufferService: EventBufferService,
) {}
```

#### c) `MetricsPersistenceService` → Múltiples servicios
```typescript
// ❌ Dependencias directas
constructor(
  private readonly eventBufferService: EventBufferService,
  private readonly circuitBreaker: CircuitBreakerService,
) {}
```

**Mejora recomendada:**
- Inyectar siempre interfaces, nunca implementaciones concretas
- Usar tokens de inyección para desacoplar

---

### 4. **Múltiples Responsabilidades en Servicios**

#### `EventBufferService`
- Gestiona el buffer en memoria
- Maneja checkpointing (persistencia en disco)
- Calcula métricas
- Valida eventos

**Mejora:** Separar en:
- `EventBufferService` - Solo gestión del buffer
- `CheckpointService` - Persistencia/recuperación
- `BufferMetricsService` - Cálculo de métricas del buffer

#### `EventService`
- Enriquecimiento de eventos
- Validación de timestamps
- Sanitización
- Búsqueda de eventos
- Inserción batch

**Mejora:** Considerar separar:
- `EventEnrichmentService` - Enriquecimiento y validación
- `EventQueryService` - Búsqueda y paginación

#### `BusinessMetricsService`
- Consultas SQL complejas
- Cacheo de resultados
- Transformación de datos

**Mejora:** Separar:
- `BusinessMetricsRepository` - Acceso a datos
- `BusinessMetricsService` - Lógica de negocio y cacheo

---

### 5. **Acoplamiento a Detalles de Implementación**

#### `BatchWorkerService`
Accede directamente a métodos internos de otros servicios sin abstracción clara.

**Problema:**
```typescript
// ❌ Conoce detalles de implementación del buffer
const batch = this.eventBufferService.drain(requestedBatchSize);
```

**Mejora:** Crear interfaz `IBufferReader` para operaciones de lectura.

---

### 6. **Dependencias Circulares Potenciales**

**Estructura actual:**
- `EventModule` exporta `EventService` y `EventBufferService`
- `BatchWorkerModule` importa `EventModule` y usa ambos servicios
- `RetentionModule` importa `EventModule` y usa `EventService`

**Riesgo:** Dependencias circulares al crecer el proyecto.

**Mejora:** 
- Crear módulos de abstracción compartidos
- Usar forwardRef() si es necesario
- Considerar arquitectura en capas más explícita

---

## 🟡 Problemas Moderados

### 7. **Uso Inconsistente de Interfaces**

Algunos servicios tienen interfaces pero no se usan consistentemente:
- `IEventService` existe pero se inyecta `EventService` directamente
- `IEventBufferService` existe pero se usa la implementación concreta

**Mejora:**
- Crear tokens de inyección para todas las interfaces
- Configurar providers para usar interfaces como tokens

---

### 8. **Lógica de Negocio Mezclada con Infraestructura**

#### `EventBufferService`
Mezcla lógica de negocio (gestión del buffer) con infraestructura (checkpointing en disco).

**Mejora:**
- Usar patrón Repository para checkpointing
- Inyectar `ICheckpointRepository` en lugar de manejar FS directamente

---

### 9. **Acceso Directo a Utilidades Globales**

Varios servicios acceden directamente a:
- `ErrorLogger` (utilidad estática)
- `Sanitizer` (utilidad estática)

**Mejora:**
- Convertir en servicios inyectables
- Crear interfaces para mayor flexibilidad

---

### 10. **Configuración Hardcodeada**

Algunos valores están hardcodeados:
```typescript
// ❌ En BusinessMetricsService
private readonly CACHE_TTL_MS = 60000; // 1 minuto

// ❌ En MetricsPersistenceService
private readonly PERSISTENCE_INTERVAL_MS = 60000; // 1 minuto
```

**Mejora:**
- Mover a configuración inyectable
- Permitir configuración por ambiente

---

## 🟢 Mejoras Recomendadas por Prioridad

### Prioridad Alta (Impacto Alto)

1. **Inyectar configuración en lugar de acceder a `envs` directamente**
   - Crear módulo de configuración con tokens
   - Inyectar configuraciones específicas por servicio

2. **Usar interfaces para todas las dependencias entre servicios**
   - Crear tokens de inyección para interfaces
   - Actualizar providers en módulos

3. **Separar `BusinessMetricsService` del ORM**
   - Crear `IBusinessMetricsRepository`
   - Mover queries SQL al repositorio

### Prioridad Media

4. **Separar responsabilidades en `EventBufferService`**
   - Extraer checkpointing a `CheckpointService`
   - Extraer métricas a servicio separado

5. **Convertir utilidades estáticas en servicios inyectables**
   - `ErrorLogger` → `ErrorLoggerService`
   - `Sanitizer` → `SanitizerService`

6. **Mover valores hardcodeados a configuración**
   - Cache TTLs
   - Intervalos de persistencia
   - Límites de batch

### Prioridad Baja

7. **Reorganizar estructura de módulos**
   - Crear módulos de dominio separados de infraestructura
   - Separar concerns de persistencia

8. **Implementar patrón Factory para creación de servicios complejos**
   - Especialmente para servicios con múltiples dependencias

9. **Agregar interfaces para operaciones de lectura del buffer**
   - `IBufferReader` para operaciones de solo lectura
   - Separar concerns de lectura/escritura

---

## 📋 Plan de Acción Detallado

### Fase 1: Configuración (1-2 días)

1. Crear módulo `ConfigModule` con providers de configuración
2. Crear tokens de inyección para cada grupo de configuración
3. Refactorizar servicios para inyectar configuración en lugar de usar `envs`
4. Actualizar tests para usar configuración mockeable

### Fase 2: Interfaces y Abstracciones (2-3 días)

1. Crear tokens de inyección para todas las interfaces existentes
2. Actualizar providers en módulos para usar interfaces como tokens
3. Refactorizar `BusinessMetricsService` para usar repositorio abstracto
4. Crear interfaces faltantes (`ICheckpointRepository`, `IBufferReader`)

### Fase 3: Separación de Responsabilidades (3-4 días)

1. Extraer `CheckpointService` de `EventBufferService`
2. Extraer métricas del buffer a servicio separado
3. Crear `BusinessMetricsRepository` separado de la lógica
4. Refactorizar `EventService` si es necesario

### Fase 4: Utilidades como Servicios (1-2 días)

1. Convertir `ErrorLogger` a `ErrorLoggerService`
2. Convertir `Sanitizer` a `SanitizerService`
3. Actualizar todos los servicios que las usan
4. Actualizar tests

---

## 🎯 Métricas de Éxito

- **Reducción de dependencias directas:** < 20% de servicios con dependencias directas
- **Cobertura de interfaces:** 100% de servicios con interfaces
- **Configuración inyectable:** 100% de servicios sin acceso directo a `envs`
- **Testabilidad:** Todos los servicios testables sin mocks complejos
- **Principios SOLID:** Cumplimiento de al menos SRP y DIP en todos los servicios

---

## 📝 Notas Adicionales

- Las mejoras deben implementarse de forma incremental
- Priorizar servicios más críticos y más acoplados
- Mantener compatibilidad hacia atrás durante la refactorización
- Agregar tests antes de refactorizar (test-driven refactoring)
- Documentar interfaces y contratos claramente

