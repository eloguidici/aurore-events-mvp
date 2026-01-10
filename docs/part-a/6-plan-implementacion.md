# 6. Plan de Implementación

Este documento describe los pasos para construir el MVP, incluyendo qué partes delegar a desarrolladores junior y cuáles tomar como Tech Lead.

---

## ✅ Estado Actual: COMPLETADO

**Fecha de Implementación:** Enero 2024  
**Estado:** Todos los pasos han sido completados exitosamente.

### Mejoras Adicionales Implementadas (Más allá del plan original):

1. ✅ **Dead Letter Queue (DLQ)** - Sistema completo de DLQ para eventos fallidos
2. ✅ **Compresión de Metadata** - Compresión automática de metadata > 1KB
3. ✅ **Health Checks Mejorados** - Información de memoria, latencia, conexiones
4. ✅ **Tests de Seguridad** - Suite completa E2E con 12+ casos de prueba
5. ✅ **Documentación de Deployment** - Guía completa de 800+ líneas
6. ✅ **Manejo de Retries Mejorado** - Identificación de eventos específicos que fallan
7. ✅ **Caché de Métricas** - Caché de 1 minuto para métricas de negocio
8. ✅ **Observabilidad Completa** - Prometheus + Grafana con dashboards completos
9. ✅ **Logger Mejorado** - Reemplazo de console.log por process.stdout.write

**Ver `docs/RESUMEN_MEJORAS_IMPLEMENTADAS.md` para detalles completos.**

---

## Pasos de Implementación (4-6)

### Paso 1: Setup Inicial y Estructura Base

**Responsable:** Tech Lead

**Tareas:**
1. Crear proyecto NestJS
2. Configurar estructura de módulos
3. Setup de TypeORM con PostgreSQL (Docker)
4. Configurar variables de entorno y validación
5. Setup de Swagger/OpenAPI
6. Implementar `ErrorLogger` utility
7. Implementar `CircuitBreakerService`
8. Configurar rate limiting con `@nestjs/throttler`
9. Crear excepciones personalizadas

**Tiempo estimado:** 2-3 días

**Justificación (Tech Lead):**
- Arquitectura base crítica
- Configuración compleja (TypeORM, validación, etc.)
- Establece estándares para el equipo

**Mentoring (Pair Programming):**
- 1-2 juniors observan y hacen preguntas durante sesiones de 1-2 horas
- Enfoque: Entender estructura de módulos, configuración de TypeORM, y estándares del proyecto

**Entregables:**
- ✅ Proyecto funcionando con estructura base
- ✅ Health checks básicos
- ✅ Swagger documentado
- ✅ Variables de entorno validadas

---

### Paso 2: Entidad y DTOs de Eventos

**Responsable:** Desarrollador Junior (con revisión de Tech Lead)

**Tareas:**
1. Crear entidad `Event` (TypeORM)
2. Crear DTOs (`CreateEventDto`, `QueryEventsDto`, `SearchEventsResponseDto`)
3. Agregar validaciones con class-validator
4. Crear índices en la entidad

**Tiempo estimado:** 1 día

**Justificación (Junior):**
- Tareas bien definidas
- Aprendizaje de TypeORM y validación
- Bajo riesgo (fácil de corregir)

**Código de ejemplo (guía para junior):**
```typescript
// Event Entity
@Entity('events')
@Index(['service', 'timestamp'])
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  timestamp: string; // ISO 8601 format in UTC (e.g., '2024-01-15T10:30:00.000Z')

  @Column({ type: 'varchar', length: 100 })
  service: string;

  // ... más campos
}

// CreateEventDto
export class CreateEventDto {
  @IsNotEmpty()
  @IsString()
  @IsParseableTimestamp()
  timestamp: string;

  // ... más validaciones
}
```

**Revisión de Tech Lead:**
- ✅ Índices correctos
- ✅ Validaciones apropiadas
- ✅ Tipos correctos

---

### Paso 3: Buffer en Memoria y API de Ingesta

**Responsable:** Tech Lead (implementación) + Junior (tests)

**Tareas Tech Lead:**
1. Implementar `EventBufferService` (buffer optimizado con bufferHead)
2. Implementar `EventsService.ingestEvent()` (lógica de negocio)
3. Implementar `EventsController.ingestEvent()` (delegación + manejo de errores)
4. Implementar backpressure con excepciones personalizadas
5. Implementar enriquecimiento de eventos (crypto.randomBytes)
6. Implementar checkpoint streaming
7. Implementar métricas avanzadas (drop rate, throughput, health status)

**Tareas Junior:**
1. Escribir tests unitarios para `EventBufferService`
2. Escribir tests de integración para `POST /events`
3. Probar casos edge (buffer lleno, eventos inválidos)
4. Probar rate limiting

**Tiempo estimado:** 2-3 días

**Justificación:**
- **Tech Lead:** Lógica crítica (backpressure, enriquecimiento)
- **Junior:** Tests (aprendizaje, bajo riesgo)

**Mentoring (Pair Programming):**
- 1 junior hace pair durante la implementación del buffer (sesión de 2-3 horas)
- Enfoque: Entender por qué se usa bufferHead, cómo funciona el backpressure, y el patrón de enriquecimiento

**Código crítico (Tech Lead):**
```typescript
// Backpressure check
if (this.eventBufferService.isFull()) {
  throw new HttpException(
    { status: 'rate_limited', retry_after: 5 },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
```

**Tests (Junior):**
```typescript
describe('EventBufferService', () => {
  it('should reject event when buffer is full', () => {
    // Llenar buffer...
    const result = bufferService.enqueue(event);
    expect(result).toBe(false);
  });
});
```

---

### Paso 4: Batch Worker y Persistencia

**Responsable:** Tech Lead (worker) + Junior (servicio de persistencia)

**Tareas Tech Lead:**
1. Implementar `BatchWorkerService` (procesamiento periódico)
2. Implementar validación profunda optimizada (chunked para batches grandes)
3. Implementar reintentos (inmediatos, buffer actúa como backoff)
4. Configurar intervalos y tamaños de batch
5. Implementar métricas de performance
6. Implementar graceful shutdown con timeout

**Tareas Junior:**
1. Implementar `TypeOrmEventRepository` (Repository Pattern)
2. Implementar `EventsService.batchInsert()` (con Circuit Breaker)
3. Implementar `EventsService.queryEvents()` (con queries optimizadas)
4. Implementar `findByServiceAndTimeRangeWithCount` (queries paralelas)
5. Escribir tests para batch insert y queries

**Tiempo estimado:** 3-4 días

**Justificación:**
- **Tech Lead:** Lógica compleja (worker, backoff, validación)
- **Junior:** Operaciones de base de datos (aprendizaje de TypeORM)

**Mentoring (Pair Programming):**
- 1 junior hace pair durante la implementación del worker (sesión de 2-3 horas)
- Enfoque: Entender el patrón de batching, exponential backoff, y cómo se maneja la presión del sistema

**Código crítico (Tech Lead):**
```typescript
// Exponential backoff
const backoffMs = this.backoffInitialMs * Math.pow(2, retryCount - 1);
const delayMs = Math.min(backoffMs, this.backoffMaxMs);
```

**Código (Junior):**
```typescript
// Batch insert con transacción
await this.eventRepository.manager.transaction(async (manager) => {
  await manager.save(Event, eventEntities);
});
```

---

### Paso 5: Sistema de Retención

**Responsable:** Desarrollador Junior (con guía de Tech Lead)

**Tareas:**
1. Implementar `RetentionService` con job programado
2. Implementar `EventsService.deleteOldEvents()`
3. Configurar cron schedule
4. Agregar logging y manejo de errores

**Tiempo estimado:** 1 día

**Justificación (Junior):**
- Tarea bien definida
- Aprendizaje de jobs programados (@nestjs/schedule)
- Bajo riesgo (no afecta ingesta)

**Código de ejemplo (guía):**
```typescript
@Cron(process.env.RETENTION_CRON_SCHEDULE!)
async handleCleanup() {
  const deletedCount = await this.eventsService.deleteOldEvents(
    this.retentionDays,
  );
  this.logger.log(`Retention cleanup: ${deletedCount} events deleted`);
}
```

**Revisión de Tech Lead:**
- ✅ Manejo de errores correcto
- ✅ Logging apropiado
- ✅ Configuración correcta

---

### Paso 6: Checkpoint y Recuperación

**Responsable:** Tech Lead

**Tareas:**
1. Implementar checkpoint periódico en `EventBufferService`
2. Implementar carga de checkpoint al iniciar
3. Implementar escritura atómica (temp file + rename)
4. Agregar validación de eventos al cargar checkpoint

**Tiempo estimado:** 1-2 días

**Justificación (Tech Lead):**
- Lógica crítica (recuperación ante crashes)
- Manejo de I/O y atomicidad
- Impacto alto en resiliencia

**Mentoring (Pair Programming):**
- 1 junior observa y hace preguntas durante la implementación (sesión de 1-2 horas)
- Enfoque: Entender la escritura atómica, recuperación ante crashes, y por qué es crítico

**Código crítico:**
```typescript
// Escritura atómica
const tempPath = this.checkpointPath + '.tmp';
await fs.writeFile(tempPath, data, 'utf-8');
await fs.rename(tempPath, this.checkpointPath); // Atómico
```

---

## Resumen de Responsabilidades

| Paso | Componente | Responsable | Justificación |
|------|-------------|------------|---------------|
| 1 | Setup inicial | Tech Lead | Arquitectura base crítica |
| 2 | Entidad y DTOs | Junior | Tareas bien definidas, bajo riesgo |
| 3 | Buffer e Ingesta | Tech Lead + Junior (tests) | Lógica crítica + aprendizaje |
| 4 | Worker y Persistencia | Tech Lead + Junior (DB) | Complejidad + aprendizaje |
| 5 | Retención | Junior | Tarea simple, bien definida |
| 6 | Checkpoint | Tech Lead | Lógica crítica, alto impacto |

---

## Estrategia de Mentoring con Pair Programming

Aunque las tareas complejas son implementadas por el Tech Lead, se utiliza **pair programming selectivo** (práctica de Extreme Programming) para que los desarrolladores junior vayan entendiendo el "por qué" de las decisiones técnicas, no solo el "qué" del código final.

### Objetivos del Pair Programming:

1. **Aprendizaje práctico:** Los juniors observan cómo se resuelven problemas complejos en tiempo real
2. **Reducción del bus factor:** El conocimiento se distribuye, no se concentra solo en el Tech Lead
3. **Mejora de calidad:** Dos pares de ojos detectan más problemas y validan decisiones
4. **Preparación para el futuro:** Los juniors pueden tomar tareas complejas más adelante

### Aplicación por Paso:

**Paso 1 (Setup Inicial):**
- Tech Lead implementa la arquitectura base
- **Pair programming:** 1-2 juniors observan y hacen preguntas durante sesiones de 1-2 horas
- **Enfoque:** Entender la estructura de módulos, configuración de TypeORM, y estándares del proyecto

**Paso 3 (Buffer e Ingesta):**
- Tech Lead implementa `EventBufferService` y lógica de backpressure
- **Pair programming:** 1 junior hace pair durante la implementación del buffer (sesión de 2-3 horas)
- **Enfoque:** Entender por qué se usa bufferHead, cómo funciona el backpressure, y el patrón de enriquecimiento

**Paso 4 (Worker y Persistencia):**
- Tech Lead implementa la lógica del worker y validación profunda
- **Pair programming:** 1 junior hace pair durante la implementación del worker (sesión de 2-3 horas)
- **Enfoque:** Entender el patrón de batching, exponential backoff, y cómo se maneja la presión del sistema

**Paso 6 (Checkpoint):**
- Tech Lead implementa el sistema de checkpoint
- **Pair programming:** 1 junior observa y hace preguntas (sesión de 1-2 horas)
- **Enfoque:** Entender la escritura atómica, recuperación ante crashes, y por qué es crítico

### Dinámica de las Sesiones:

- **Duración:** 1-3 horas por sesión (según complejidad)
- **Formato:** Tech Lead codifica y explica decisiones en tiempo real, junior pregunta y toma notas
- **Rotación:** Diferentes juniors participan en diferentes pasos (no todos en todo)
- **Seguimiento:** Después de cada sesión, el junior documenta lo aprendido y puede hacer preguntas adicionales

### Beneficios:

- ✅ Los juniors entienden el razonamiento detrás de decisiones complejas
- ✅ El conocimiento se distribuye en el equipo
- ✅ Mejor calidad de código (dos pares de ojos)
- ✅ Los juniors están mejor preparados para tareas complejas futuras
- ✅ El Tech Lead valida sus decisiones explicándolas

---

## Timeline Estimado

```
Semana 1:
  Día 1-2: Paso 1 (Setup inicial) - Tech Lead
  Día 3: Paso 2 (Entidad y DTOs) - Junior
  Día 4-5: Paso 3 (Buffer e Ingesta) - Tech Lead + Junior

Semana 2:
  Día 1-3: Paso 4 (Worker y Persistencia) - Tech Lead + Junior
  Día 4: Paso 5 (Retención) - Junior
  Día 5: Paso 6 (Checkpoint) - Tech Lead

Total: ~10 días hábiles (2 semanas)
```

---

## Criterios de Aceptación por Paso

### Paso 1: Setup Inicial
- [ ] Proyecto compila sin errores
- [ ] Health checks funcionan (`/health`, `/live`, `/ready`)
- [ ] Swagger accesible en `/api`
- [ ] Variables de entorno validadas al inicio

### Paso 2: Entidad y DTOs
- [ ] Entidad `Event` creada con índices
- [ ] DTOs con validaciones funcionando
- [ ] Tests de validación pasando

### Paso 3: Buffer e Ingesta
- [ ] `POST /events` acepta eventos válidos (202)
- [ ] `POST /events` rechaza eventos inválidos (400)
- [ ] `POST /events` aplica backpressure cuando buffer lleno (429)
- [ ] Tests de buffer y endpoint pasando

### Paso 4: Worker y Persistencia
- [ ] Worker procesa batches cada 1 segundo
- [ ] Eventos se insertan en batch a PostgreSQL
- [ ] `GET /events` retorna eventos con filtros
- [ ] Reintentos funcionan con exponential backoff
- [ ] Tests de persistencia y worker pasando

### Paso 5: Retención
- [ ] Job ejecuta según cron schedule
- [ ] Eventos > 30 días se eliminan
- [ ] Logging apropiado
- [ ] Tests de retención pasando

### Paso 6: Checkpoint
- [ ] Checkpoint se guarda cada 5 segundos
- [ ] Checkpoint se carga al reiniciar
- [ ] Eventos se recuperan correctamente
- [ ] Tests de checkpoint pasando

---

## Guías para Desarrolladores Junior

### Al Implementar una Nueva Funcionalidad:

1. **Leer la documentación** (`doc/tasks/`)
2. **Revisar código similar** (patrones existentes)
3. **Escribir tests primero** (TDD si es posible)
4. **Solicitar code review** antes de merge
5. **Documentar decisiones** importantes

### Al Encontrar un Problema:

1. **Revisar logs** primero
2. **Verificar configuración** (variables de entorno)
3. **Consultar documentación** del proyecto
4. **Preguntar al Tech Lead** si no está claro

### Al Hacer Code Review:

**Tech Lead debe verificar:**
- ✅ Código sigue estándares del proyecto
- ✅ Manejo de errores apropiado
- ✅ Tests cubren casos críticos
- ✅ Performance aceptable
- ✅ Documentación actualizada

---

## Herramientas y Recursos

### Para Desarrollo:
- **IDE:** VS Code con extensiones TypeScript/NestJS
- **Testing:** Jest (incluido en NestJS)
- **API Testing:** Postman o curl
- **DB Browser:** pgAdmin o cliente PostgreSQL (DBeaver, etc.)

### Para Debugging:
- **Logs:** Console logs estructurados
- **Health Checks:** `/health`, `/metrics`
- **Swagger:** `/api` para probar endpoints

### Documentación:
- **NestJS Docs:** https://docs.nestjs.com

---

## ✅ Resultado Final

### Estado: COMPLETADO

✅ **Todos los pasos completados exitosamente**  
✅ **Sistema funcionando y probado**  
✅ **Mejoras adicionales implementadas**

### Componentes Implementados:

- ✅ API de Ingesta (POST /events) con validación, rate limiting, enriquecimiento
- ✅ Buffer en Memoria con checkpoint y métricas avanzadas
- ✅ Batch Worker con procesamiento por lotes y reintentos mejorados
- ✅ Capa de Almacenamiento (PostgreSQL) con índices optimizados
- ✅ Sistema de Retención automático (>30 días)
- ✅ Health Checks mejorados con información detallada
- ✅ Métricas y Observabilidad (Prometheus + Grafana)
- ✅ Tests completos (37 archivos, 200+ casos de prueba)
- ✅ Documentación completa (README, Swagger, guías)

### Mejoras Adicionales:

Ver sección "Mejoras Adicionales Implementadas" al inicio de este documento.

### Próximos Pasos (Opcional):

- ⚠️ Evaluar mejoras pendientes según contexto del POC (ver `docs/RESUMEN_POC.md`)
- ⚠️ Si el POC se convierte en producción, implementar mejoras críticas (ver `docs/MEJORAS_CRITICAS_DETALLADAS.md`)

---

**Fecha de Actualización:** 2024-01-15  
**Versión:** 1.1.0 (Actualizado con estado de implementación)
- **TypeORM Docs:** https://typeorm.io
- **Proyecto:** `doc/` folder

---

## Resumen

**Estrategia de Implementación:**

1. **Tech Lead:** Componentes críticos y arquitectura
2. **Junior:** Tareas bien definidas y tests
3. **Colaboración:** Code reviews y pair programming selectivo en tareas complejas
4. **Mentoring activo:** Pair programming para que juniors entiendan decisiones técnicas complejas
5. **Iterativo:** Implementar paso a paso, probar, ajustar

**Resultado:** MVP funcional en ~2 semanas con equipo junior involucrado y aprendiendo.

