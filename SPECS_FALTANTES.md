# Lista de Specs Faltantes

Lista meticulosa de archivos de specs faltantes, basado en el patrón del módulo `event`.

---

## 📁 MÓDULO: `batch-worker`

### ✅ Specs Existentes
- ✅ `specs/services/batch-worker.service.spec.ts`

### ❌ Specs Faltantes
**Ninguno** - Este módulo tiene cobertura completa.

**Nota:** Las interfaces (`services/interfaces/batch-validation-result.interface.ts`) no necesitan specs ya que son solo tipos TypeScript.

---

## 📁 MÓDULO: `common`

### ✅ Specs Existentes
- ✅ `services/circuit-breaker.service.spec.ts`
- ✅ `utils/sanitizer.spec.ts`

### ❌ Specs Faltantes

#### Services
- ❌ `specs/services/error-handling.service.spec.ts`
  - **Archivo original:** `services/error-handling.service.ts`
  - **Justificación:** Service con lógica de manejo de errores, handlers de procesos, debe ser testeado

- ❌ `specs/services/health.service.spec.ts`
  - **Archivo original:** `services/health.service.ts`
  - **Justificación:** Service crítico para health checks, readiness, liveness, shutdown handling

- ❌ `specs/services/metrics-collector.service.spec.ts`
  - **Archivo original:** `services/metrics-collector.service.ts`
  - **Justificación:** Service que recolecta y expone métricas del sistema, tiene lógica de agregación

#### Decorators
- ❌ `specs/decorators/max-time-range.decorator.spec.ts`
  - **Archivo original:** `decorators/max-time-range.decorator.ts`
  - **Justificación:** Decorator con lógica de validación (IsMaxTimeRangeConstraint), debe testearse

- ❌ `specs/decorators/sort-field.decorator.spec.ts`
  - **Archivo original:** `decorators/sort-field.decorator.ts`
  - **Justificación:** Decorator con lógica de validación para campos de ordenamiento

- ❌ `specs/decorators/sort-order.decorator.spec.ts`
  - **Archivo original:** `decorators/sort-order.decorator.ts`
  - **Justificación:** Decorator con lógica de validación para orden ASC/DESC

- ❌ `specs/decorators/valid-time-range.decorator.spec.ts`
  - **Archivo original:** `decorators/valid-time-range.decorator.ts`
  - **Justificación:** Decorator con lógica de validación (IsValidTimeRangeConstraint)

#### Guards
- ❌ `specs/guards/ip-throttler.guard.spec.ts`
  - **Archivo original:** `guards/ip-throttler.guard.ts`
  - **Justificación:** Guard con lógica de throttling por IP, debe testearse

#### Middleware
- ❌ `specs/middleware/correlation-id.middleware.spec.ts`
  - **Archivo original:** `middleware/correlation-id.middleware.ts`
  - **Justificación:** Middleware con lógica de generación y manejo de correlation IDs

#### Utils
- ❌ `specs/utils/error-logger.spec.ts`
  - **Archivo original:** `utils/error-logger.ts`
  - **Justificación:** Utilidad con métodos estáticos para logging de errores, debe testearse

- ❌ `specs/utils/tracing.spec.ts`
  - **Archivo original:** `utils/tracing.ts`
  - **Justificación:** Utilidad con métodos estáticos para tracing distribuido, tiene lógica testable

- ❌ `specs/utils/type-guards.spec.ts`
  - **Archivo original:** `utils/type-guards.ts`
  - **Justificación:** Type guards con lógica de validación de tipos, deben testearse todas las funciones

#### Constants
- ⚠️ `specs/constants/constants.spec.ts` (OPCIONAL)
  - **Archivo original:** `constants/constants.ts`
  - **Justificación:** Constantes simples, generalmente no necesitan specs, pero podría validarse que existen

**Resumen módulo `common`:**
- Services faltantes: 3
- Decorators faltantes: 4
- Guards faltantes: 1
- Middleware faltantes: 1
- Utils faltantes: 3
- **TOTAL: 12 specs faltantes** (11 obligatorios + 1 opcional)

---

## 📁 MÓDULO: `config`

### ✅ Specs Existentes
- ✅ `specs/envs.spec.ts`

### ❌ Specs Faltantes
**Ninguno** - Este módulo tiene cobertura completa.

---

## 📁 MÓDULO: `retention`

### ✅ Specs Existentes
- ✅ `specs/services/retention.service.spec.ts`

### ❌ Specs Faltantes
**Ninguno** - Este módulo tiene cobertura completa.

**Nota:** Las interfaces (`services/interfaces/retention-service.interface.ts`) no necesitan specs ya que son solo tipos TypeScript.

---

## 📁 MÓDULO: `event`

### ✅ Specs Existentes
- ✅ `specs/controllers/event-health.controller.spec.ts`
- ✅ `specs/controllers/events.controller.spec.ts`
- ✅ `specs/dtos/business-metrics-response.dto.spec.ts`
- ✅ `specs/dtos/create-event.dto.spec.ts`
- ✅ `specs/dtos/ingest-event-response.dto.spec.ts`
- ✅ `specs/dtos/metrics-response.dto.spec.ts`
- ✅ `specs/dtos/query-events.dto.spec.ts`
- ✅ `specs/dtos/search-events-response.dto.spec.ts`
- ✅ `specs/exceptions/buffer-saturated.exception.spec.ts`
- ✅ `specs/exceptions/invalid-time-range.exception.spec.ts`
- ✅ `specs/exceptions/service-unavailable.exception.spec.ts`
- ✅ `specs/repositories/file-metrics.repository.spec.ts`
- ✅ `specs/repositories/typeorm-event.repository.spec.ts`
- ✅ `specs/services/business-metrics.service.spec.ts`
- ✅ `specs/services/event-buffer.service.spec.ts`
- ✅ `specs/services/events.service.spec.ts`
- ✅ `specs/services/metrics-persistence.service.spec.ts`

### ❌ Specs Faltantes

#### Constants
- ⚠️ `specs/constants/query.constants.spec.ts` (OPCIONAL)
  - **Archivo original:** `constants/query.constants.ts`
  - **Justificación:** Constantes, generalmente no necesitan specs, pero podría validarse que existen

#### Entities
- ⚠️ `specs/entities/event.entity.spec.ts` (OPCIONAL)
  - **Archivo original:** `entities/event.entity.ts`
  - **Justificación:** Entidades TypeORM generalmente no necesitan specs unitarios, pero podrían validarse métodos custom

#### Controllers - Decorators
- ⚠️ `specs/controllers/decorators/swagger.decorators.spec.ts` (OPCIONAL)
  - **Archivo original:** `controllers/decorators/swagger.decorators.ts`
  - **Justificación:** Si contiene lógica además de decoradores de Swagger, podría necesitar specs

**Resumen módulo `event`:**
- **TOTAL: 0-3 specs faltantes** (todos opcionales)

---

## 📊 RESUMEN GENERAL

### Total de Specs Faltantes (Obligatorios)

| Módulo | Cantidad |
|--------|----------|
| `batch-worker` | 0 |
| `common` | **11** |
| `config` | 0 |
| `retention` | 0 |
| `event` | 0 |
| **TOTAL** | **11** |

### Total de Specs Faltantes (Opcionales)

| Módulo | Cantidad |
|--------|----------|
| `common` | 1 (constants) |
| `event` | 3 (constants, entity, decorators) |
| **TOTAL** | **4** |

---

## 🎯 PRIORIDAD DE IMPLEMENTACIÓN

### Alta Prioridad (Críticos)
1. `common/specs/services/health.service.spec.ts` - Service crítico para health checks
2. `common/specs/services/error-handling.service.spec.ts` - Manejo de errores globales
3. `common/specs/services/metrics-collector.service.spec.ts` - Métricas del sistema
4. `common/specs/guards/ip-throttler.guard.spec.ts` - Seguridad y rate limiting

### Media Prioridad (Importantes)
5. `common/specs/decorators/max-time-range.decorator.spec.ts` - Validación de rangos de tiempo
6. `common/specs/decorators/valid-time-range.decorator.spec.ts` - Validación de rangos
7. `common/specs/middleware/correlation-id.middleware.spec.ts` - Trazabilidad

### Baja Prioridad (Utils y otros)
8. `common/specs/utils/error-logger.spec.ts`
9. `common/specs/utils/tracing.spec.ts`
10. `common/specs/utils/type-guards.spec.ts`
11. `common/specs/decorators/sort-field.decorator.spec.ts`
12. `common/specs/decorators/sort-order.decorator.spec.ts`

---

## 📝 NOTAS

- **Interfaces**: Las interfaces TypeScript (`.interface.ts`) no necesitan specs ya que son solo tipos
- **Modules**: Los archivos `.module.ts` generalmente no necesitan specs (son configuración)
- **Tokens**: Los archivos `.token.ts` no necesitan specs (son solo constantes de inyección)
- **Index files**: Los archivos `index.ts` que solo exportan no necesitan specs

---

Generado: $(date)

