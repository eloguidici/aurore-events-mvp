# 6. Plan de Implementación

Este documento describe los pasos para construir el MVP, incluyendo qué partes delegar a desarrolladores junior y cuáles tomar como Tech Lead.

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
  timestamp: string;

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
- **TypeORM Docs:** https://typeorm.io
- **Proyecto:** `doc/` folder

---

## Resumen

**Estrategia de Implementación:**

1. **Tech Lead:** Componentes críticos y arquitectura
2. **Junior:** Tareas bien definidas y tests
3. **Colaboración:** Code reviews y pair programming cuando sea necesario
4. **Iterativo:** Implementar paso a paso, probar, ajustar

**Resultado:** MVP funcional en ~2 semanas con equipo junior involucrado y aprendiendo.

