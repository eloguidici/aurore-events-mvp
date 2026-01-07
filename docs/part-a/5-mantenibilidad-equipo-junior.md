# 5. Mantenibilidad para un Equipo Junior

Este documento describe las decisiones tomadas para reducir complejidad, facilitar el mantenimiento y establecer estándares para un equipo junior.

---

## Decisiones para Reducir Complejidad

### 1. Arquitectura Simple y Lineal

**Decisión:** Flujo lineal sin microservicios ni arquitectura distribuida compleja.

**Beneficios para juniors:**
- ✅ Fácil de entender (un solo servicio)
- ✅ Debugging simple (todo en un lugar)
- ✅ Sin comunicación entre servicios
- ✅ Testing más simple

**Código ejemplo:**
```typescript
// Flujo simple: Controller → Service → Repository
// No hay servicios remotos, message queues complejas, etc.
```

---

### 2. Sin Dependencias Externas Complejas

**Decisión:** PostgreSQL (via Docker para simplicidad), buffer en memoria en vez de Redis/Kafka.

**Beneficios para juniors:**
- ✅ Setup inmediato (sin configurar servidores)
- ✅ Fácil de testear localmente
- ✅ Menos puntos de fallo
- ✅ Documentación más simple

**Trade-off aceptado:**
- Escalabilidad limitada (suficiente para MVP)

---

### 3. Validación en Dos Capas (Clara Separación)

**Decisión:** Validación en el borde (DTO) y validación profunda (worker).

**Beneficios para juniors:**
- ✅ Separación clara de responsabilidades
- ✅ Fácil de entender qué valida cada capa
- ✅ Código más mantenible

**Código ejemplo:**
```typescript
// Capa 1: DTO (validación básica)
@IsNotEmpty()
@IsString()
service: string;

// Capa 2: Worker (validación profunda)
private validateEvent(event: EnrichedEvent): boolean {
  // Validación más compleja aquí
}
```

---

### 4. Manejo de Errores Estandarizado (ErrorLogger)

**Decisión:** ErrorLogger centralizado para logging consistente.

**Beneficios para juniors:**
- ✅ Formato consistente en todos los logs
- ✅ Contexto estructurado siempre incluido
- ✅ Fácil de usar (métodos estáticos)
- ✅ Sistema resiliente (no se rompe)

**Código ejemplo:**
```typescript
// Antes (inconsistente)
this.logger.error(`Batch insert failed: ${error.message}`, error.stack);

// Ahora (estandarizado)
ErrorLogger.logError(
  this.logger,
  'Batch insert failed',
  error,
  { eventsCount: events.length, service: 'batch-worker' },
);
```

**Métodos disponibles:**
- `ErrorLogger.logError()` - Para errores
- `ErrorLogger.logWarning()` - Para advertencias
- `ErrorLogger.createContext()` - Para crear contexto estructurado

---

### 5. Configuración Centralizada

**Decisión:** Todas las configuraciones via variables de entorno, validadas al inicio.

**Beneficios para juniors:**
- ✅ Un solo lugar para configurar
- ✅ Validación temprana (errores claros)
- ✅ Fácil de cambiar sin tocar código

**Archivo:** `env.example`
```env
BUFFER_MAX_SIZE=50000
BATCH_SIZE=500
DRAIN_INTERVAL=1000
RETENTION_DAYS=30
```

---

## Mejoras Implementadas para Mantenibilidad

### 1. Type Guards para Validación

**Implementación:** Utilidades de validación de tipos (`type-guards.ts`).

**Beneficios para juniors:**
- ✅ Validación reutilizable
- ✅ Código más claro
- ✅ Type safety mejorado

**Ejemplo:**
```typescript
import { isNonEmptyString, isPositiveInteger } from '../../common/utils/type-guards';

if (!isNonEmptyString(createEventDto.service)) {
  throw new Error('Service must be a non-empty string');
}
```

### 2. Excepciones Personalizadas

**Implementación:** Excepciones específicas del dominio.

**Beneficios para juniors:**
- ✅ Código más expresivo
- ✅ Manejo de errores más claro
- ✅ Fácil de entender qué error ocurrió

**Ejemplo:**
```typescript
// En vez de HttpException genérico
throw new BufferSaturatedException(retryAfterSeconds);
throw new ServiceUnavailableException();
```

### 3. Repository Pattern

**Implementación:** Interfaz `IEventRepository` con implementación TypeORM.

**Beneficios para juniors:**
- ✅ Separación clara de responsabilidades
- ✅ Fácil de testear (mockear interfaz)
- ✅ Código más mantenible

---

## Qué Dejamos Fuera del MVP

### 1. Autenticación y Autorización

**Razón:** Complejidad adicional no necesaria para MVP.

**Nota:** Rate limiting está implementado con `@Throttle` y es configurable via variables de entorno:
- `THROTTLE_GLOBAL_LIMIT`: Límite global (default: 300,000)
- `THROTTLE_IP_LIMIT`: Límite por IP (default: 10,000)
- `THROTTLE_QUERY_LIMIT`: Límite para queries (default: 200)
- `THROTTLE_HEALTH_LIMIT`: Límite para health checks (default: 60)

**Para el futuro:**
- API keys por cliente
- JWT tokens
- Rate limiting granular por cliente

**Impacto en juniors:**
- ✅ Menos código que mantener
- ✅ Menos conceptos que aprender
- ✅ Enfoque en funcionalidad core

---

### 2. Replicación y Alta Disponibilidad

**Razón:** MVP no requiere alta disponibilidad.

**Para el futuro:**
- Replicación de base de datos
- Múltiples instancias
- Load balancing

**Impacto en juniors:**
- ✅ Arquitectura más simple
- ✅ Menos infraestructura que entender
- ✅ Testing más simple

---

### 3. Dead Letter Queue (DLQ)

**Razón:** Logging es suficiente para MVP.

**Para el futuro:**
- Tabla de eventos fallidos
- Reprocesamiento manual
- Alertas automáticas

**Impacto en juniors:**
- ✅ Menos componentes que mantener
- ✅ Flujo más simple
- ✅ Menos casos edge

---

### 4. Métricas Avanzadas y Alertas

**Razón:** Métricas básicas (`/metrics`) son suficientes.

**Para el futuro:**
- Prometheus/Grafana
- Alertas automáticas
- Dashboards

**Impacto en juniors:**
- ✅ Menos herramientas que aprender
- ✅ Enfoque en código
- ✅ Menos configuración

---

### 5. Particionado de Tablas

**Razón:** No necesario para volúmenes pequeños.

**Para el futuro:**
- Particionado por mes/año
- Mejora performance
- Facilita retención

**Impacto en juniors:**
- ✅ Schema más simple
- ✅ Queries más simples
- ✅ Menos conceptos avanzados

---

## Documentación y Estándares

### 1. Documentación de Código

**Estándar:** Comentarios JSDoc en todas las funciones públicas.

**Ejemplo:**
```typescript
/**
 * Enqueue an event to the buffer (non-blocking operation)
 * 
 * @param event - Enriched event to add to buffer
 * @returns true if event was enqueued, false if buffer is full
 */
enqueue(event: EnrichedEvent): boolean {
  // ...
}
```

**Beneficios:**
- ✅ Autocompletado en IDE
- ✅ Documentación generada automáticamente
- ✅ Fácil de entender para nuevos desarrolladores

---

### 2. Nombres Descriptivos

**Estándar:** Nombres que explican qué hace la función/clase.

**Buenos ejemplos:**
```typescript
eventBufferService.enqueue(event)
eventBufferService.drainBatch(5000)  // Configurable via BATCH_SIZE (default: 5000)
batchWorkerService.processBatch()
```

**Malos ejemplos:**
```typescript
buffer.add(e)  // ❌ No claro
worker.run()   // ❌ Muy genérico
```

**Beneficios:**
- ✅ Código auto-documentado
- ✅ Menos necesidad de comentarios
- ✅ Fácil de entender

---

### 3. Estructura de Carpetas Clara

**Estándar:** Organización por módulos (NestJS).

```
src/
  modules/
    event/
      controllers/    # Endpoints HTTP
      services/       # Lógica de negocio
      entities/       # Modelos de datos
      dtos/           # Validación de entrada
    batch-worker/
      services/       # Procesamiento en background
    retention/
      services/       # Limpieza automática
```

**Beneficios:**
- ✅ Fácil encontrar código
- ✅ Separación clara de responsabilidades
- ✅ Escalable (fácil agregar módulos)

---

### 4. Testing Básico

**Estándar:** Tests unitarios para lógica crítica.

**Ejemplo:**
```typescript
describe('EventBufferService', () => {
  it('should enqueue event when buffer has space', () => {
    const result = bufferService.enqueue(event);
    expect(result).toBe(true);
  });

  it('should reject event when buffer is full', () => {
    // Llenar buffer...
    const result = bufferService.enqueue(event);
    expect(result).toBe(false);
  });
});
```

**Beneficios:**
- ✅ Confianza al hacer cambios
- ✅ Documentación de comportamiento
- ✅ Detección temprana de bugs

---

### 5. Logging Estructurado

**Estándar:** Logs con contexto y niveles apropiados.

**Ejemplo:**
```typescript
this.logger.log('Batch worker started');
this.logger.debug('Processing batch of 500 events');
this.logger.warn('Dropped 2 invalid events');
this.logger.error('Batch insert failed', error.stack);
```

**Niveles:**
- `log`: Información general
- `debug`: Detalles para debugging
- `warn`: Advertencias (eventos inválidos, etc.)
- `error`: Errores (con stack trace)

**Beneficios:**
- ✅ Fácil de debuggear
- ✅ Niveles apropiados
- ✅ Contexto claro

---

## Guardrails para el Equipo

### 1. No Modificar el Request Path para Operaciones Lentas

**Regla:** Request path debe ser < 10ms. Operaciones lentas van al worker.

**Ejemplo incorrecto:**
```typescript
// ❌ MAL: Insertar en DB en request path
async ingestEvent(@Body() dto: CreateEventDto) {
  await this.eventsService.insert(dto); // Lento!
  return { status: 'accepted' };
}
```

**Ejemplo correcto:**
```typescript
// ✅ BIEN: Encolar y responder inmediatamente
async ingestEvent(@Body() dto: CreateEventDto) {
  this.eventBufferService.enqueue(enrichedEvent); // Rápido!
  return { status: 'accepted' };
}
```

**Razón:** Mantener latencia baja y experiencia de usuario buena.

---

### 2. Siempre Validar en el Borde

**Regla:** Validación básica en DTO, validación profunda en worker.

**Ejemplo incorrecto:**
```typescript
// ❌ MAL: Sin validación en el borde
async ingestEvent(@Body() dto: any) {
  // Validar aquí... (lento, bloquea)
}
```

**Ejemplo correcto:**
```typescript
// ✅ BIEN: Validación en DTO (automática)
async ingestEvent(@Body() dto: CreateEventDto) {
  // DTO ya validado por class-validator
}
```

**Razón:** Rechazar eventos inválidos antes de procesarlos.

---

### 3. Nunca Lanzar Errores que Rompan el Pipeline

**Regla:** Errores se loggean con ErrorLogger y el sistema continúa.

**Ejemplo incorrecto:**
```typescript
// ❌ MAL: Error rompe todo
try {
  await this.eventsService.batchInsert(events);
} catch (error) {
  throw error; // Rompe el worker
}
```

**Ejemplo correcto:**
```typescript
// ✅ BIEN: ErrorLogger y continuar
try {
  await this.eventsService.batchInsert(events);
} catch (error) {
  ErrorLogger.logError(
    this.logger,
    'Batch insert failed',
    error,
    { eventsCount: events.length },
  );
  // Continúa procesando otros eventos
}
```

**Razón:** Un evento malo no debe romper todo el sistema.

---

### 4. Usar Configuración, No Hardcode

**Regla:** Valores configurables via variables de entorno.

**Ejemplo incorrecto:**
```typescript
// ❌ MAL: Hardcoded
const batchSize = 500;
const maxSize = 50000; // Configurable via env
```

**Ejemplo correcto:**
```typescript
// ✅ BIEN: Configurable
const batchSize = this.configService.batchSize;
const maxSize = this.configService.bufferMaxSize;
```

**Razón:** Fácil de cambiar sin tocar código.

---

### 5. Documentar Decisiones Importantes

**Regla:** Comentarios explicando "por qué", no solo "qué".

**Ejemplo:**
```typescript
// ✅ BIEN: Explica por qué
// Checkpoint cada 5 segundos: balance entre pérdida (0-5s) y I/O
// Pérdida menor sería más I/O, pérdida mayor sería más riesgo
this.checkpointIntervalMs = 5000;
```

**Razón:** Futuros desarrolladores entienden decisiones.

---

## Checklist para Nuevos Desarrolladores

### Al Agregar una Nueva Funcionalidad:

- [ ] ¿Está en el request path? → Debe ser < 10ms
- [ ] ¿Requiere validación? → Validar en DTO (borde)
- [ ] ¿Puede fallar? → Loggear y continuar (no crashear)
- [ ] ¿Tiene valores configurables? → Usar ConfigService
- [ ] ¿Está documentado? → JSDoc en función pública
- [ ] ¿Tiene tests? → Tests unitarios para lógica crítica

---

## Recursos para el Equipo

### 1. Documentación del Proyecto

- `README.md`: Setup y ejecución
- `doc/`: Documentación técnica detallada
- `env.example`: Variables de entorno

### 2. Swagger/OpenAPI

- `http://localhost:3000/api`: Documentación interactiva
- Endpoints documentados con ejemplos

### 3. Logs Estructurados

- Niveles apropiados (log, debug, warn, error)
- Contexto claro en cada log

### 4. Health Checks

- `/health`: Estado general
- `/metrics`: Métricas del buffer
- `/ready`: Readiness check

---

## Resumen

**Principios para Mantenibilidad:**

1. **Simplicidad:** Elegir la opción más simple
2. **Claridad:** Código auto-documentado
3. **Resiliencia:** Sistema nunca se rompe
4. **Configurabilidad:** Fácil de cambiar sin código
5. **Documentación:** Explicar "por qué", no solo "qué"

**Para Juniors:**

- ✅ Arquitectura simple y lineal
- ✅ Sin dependencias complejas
- ✅ Código claro y bien documentado
- ✅ Guardrails claros
- ✅ Enfoque en funcionalidad core

**Resultado:** Sistema fácil de entender, mantener y extender.

