# 4. Decisiones Clave

Este documento explica las decisiones arquitectónicas y técnicas más importantes del MVP, incluyendo trade-offs y justificaciones.

---

## 1. Ingesta: Batching, Buffering y Backpressure

### Decisión: Buffer en Memoria + Batching por Tamaño y Tiempo

**Implementación:**
- Buffer en memoria (array) con capacidad 50,000 eventos (configurable via `BUFFER_MAX_SIZE`)
- Batching: 5,000 eventos por batch (configurable via `BATCH_SIZE`)
- Intervalo: Procesa cada 1 segundo (configurable via `DRAIN_INTERVAL`)

**¿Por qué?**

#### Ventajas:
1. **Simplicidad:** No requiere infraestructura externa (Redis, Kafka, etc.)
2. **Velocidad:** Acceso O(1), muy rápido
3. **Costo:** Sin costos adicionales de infraestructura
4. **Desarrollo rápido:** Fácil de implementar y debuggear

#### Trade-offs:
1. **Pérdida en crash:** Eventos en buffer se pierden si el sistema crashea
   - **Mitigación:** Checkpoint cada 5 segundos (pérdida máxima: 5 segundos)
2. **Escalabilidad limitada:** Buffer en memoria no escala horizontalmente
   - **Mitigación:** Para MVP es suficiente, migración futura a Redis/Kafka

#### Alternativas Consideradas:

**Opción A: Redis Streams**
- ✅ Escalable horizontalmente
- ✅ Persistencia automática
- ✅ ACK/retry nativo
- ❌ Requiere infraestructura externa
- ❌ Mayor complejidad
- ❌ Costo adicional

**Decisión:** Buffer en memoria para MVP (simplicidad > escalabilidad)

---

**Opción B: Kafka**
- ✅ Alta throughput
- ✅ Persistencia y replicación
- ✅ Escalable
- ❌ Overkill para MVP
- ❌ Complejidad operacional alta
- ❌ Requiere infraestructura dedicada

**Decisión:** No necesario para MVP (5,000 eventos/segundo es manejable con buffer)

---

### Decisión: Backpressure Explícito (429/503)

**Implementación:**
- Check de capacidad antes de encolar
- Retorna 429 Too Many Requests si buffer lleno
- Incluye `retry_after` para guiar al cliente

**¿Por qué?**

#### Ventajas:
1. **Protección del sistema:** Evita saturación completa
2. **Comunicación clara:** Cliente sabe que debe reintentar
3. **Degradación controlada:** Sistema se protege en vez de crashear
4. **Observable:** Métricas disponibles (`/metrics`)

#### Trade-offs:
1. **Pérdida de eventos:** Cliente debe implementar retry
   - **Mitigación:** `retry_after` guía al cliente
2. **Latencia adicional:** Cliente debe esperar antes de reintentar
   - **Mitigación:** Worker procesa, buffer se drena, sistema se recupera

#### Alternativas Consideradas:

**Opción A: Bloquear hasta que haya espacio**
- ❌ Bloquea request path (lento)
- ❌ Puede causar timeouts
- ❌ No escala

**Decisión:** Backpressure explícito (mejor UX y protección)

---

**Opción B: Descartar eventos silenciosamente**
- ❌ Pérdida de datos sin aviso
- ❌ Cliente no sabe que perdió eventos
- ❌ Difícil de debuggear

**Decisión:** Backpressure explícito (transparencia > pérdida silenciosa)

---

## 2. Almacenamiento: Dónde y Cómo

### Decisión: PostgreSQL para MVP

**Implementación:**
- PostgreSQL como base de datos (via Docker)
- Tabla: `events` con índices compuestos
- Transacciones atómicas para batch inserts
- Connection pooling (max 20 conexiones, configurable via `DB_POOL_MAX`)

**¿Por qué?**

#### Ventajas:
1. **Escalabilidad:** Mejor que SQLite para sistemas en producción
2. **Concurrencia:** Maneja múltiples escrituras simultáneas eficientemente
3. **Producción:** Estándar de la industria para sistemas robustos
4. **Setup simple:** Docker compose facilita el desarrollo local
5. **Connection pooling:** Mejor manejo de conexiones concurrentes

#### Trade-offs:
1. **Dependencia externa:** Requiere Docker/PostgreSQL corriendo
   - **Mitigación:** Docker compose simplifica setup
2. **Mayor complejidad operacional:** Comparado con SQLite
   - **Mitigación:** Compensado por mejores características

#### Alternativas Consideradas:

**Opción A: SQLite (inicialmente considerado)**
- ✅ Simplicidad máxima
- ✅ Sin dependencias externas
- ❌ Escalabilidad limitada
- ❌ Concurrencia limitada
- ❌ No ideal para producción

**Decisión:** PostgreSQL para MVP (mejor preparado para producción)

---

**Opción B: MongoDB**
- ✅ Escalable horizontalmente
- ✅ Schema flexible
- ❌ Overkill para datos estructurados
- ❌ Mayor complejidad
- ❌ SQL es más adecuado para este caso de uso

**Decisión:** PostgreSQL (datos estructurados, queries SQL optimizadas)

---

### Decisión: Índice Compuesto (service, timestamp)

**Implementación:**
```sql
CREATE INDEX idx_service_timestamp ON events(service, timestamp);
```

**¿Por qué?**

#### Ventajas:
1. **Queries rápidas:** Filtro por service + rango de tiempo es O(log n)
2. **Optimización específica:** Cubre el caso de uso principal
3. **Paginación eficiente:** Con índice, paginación es rápida

#### Trade-offs:
1. **Espacio adicional:** Índice ocupa espacio en disco
   - **Mitigación:** Trade-off aceptable por velocidad
2. **Escrituras más lentas:** Índice debe actualizarse en cada insert
   - **Mitigación:** Batch inserts reducen impacto

#### Alternativas Consideradas:

**Opción A: Índice solo en timestamp**
- ❌ Queries por service serían lentas (full table scan)
- ❌ No optimiza el caso de uso principal

**Decisión:** Índice compuesto (optimiza queries reales)

---

**Opción B: Múltiples índices (service, timestamp separados)**
- ❌ Menos eficiente que índice compuesto
- ❌ Más espacio en disco
- ❌ Queries más lentas

**Decisión:** Índice compuesto (mejor rendimiento)

---

### Decisión: Particionado por Tiempo (Futuro)

**Nota:** No implementado en MVP, pero planificado para escalabilidad

**Estrategia futura:**
- Particionar tabla por mes/año
- Facilita retención (eliminar partición completa)
- Mejora performance de queries (menos datos a escanear)

**¿Por qué no en MVP?**
- Complejidad adicional
- No necesario para volúmenes pequeños
- Migración futura cuando sea necesario

---

## 3. Retención de 30 Días

### Decisión: Job Programado Diario (Cron)

**Implementación:**
- Job ejecuta diariamente (configurable via cron)
- Elimina eventos con `timestamp < (hoy - 30 días)`
- Manejo de errores resiliente (continúa si falla)

**¿Por qué?**

#### Ventajas:
1. **Automático:** Sin intervención manual
2. **Eficiente:** Una query por día
3. **Configurable:** Fácil cambiar días de retención
4. **Resiliente:** Errores no detienen el sistema

#### Trade-offs:
1. **Latencia:** Eventos se eliminan hasta 24 horas después de expirar
   - **Mitigación:** Aceptable para MVP (30 días vs 30 días + 1)
2. **Carga puntual:** Una query grande diaria
   - **Mitigación:** PostgreSQL maneja eficientemente, particionado disponible si es necesario

#### Alternativas Consideradas:

**Opción A: Eliminación continua (cada evento verifica su expiración)**
- ❌ Overhead en cada query
- ❌ Más complejo
- ❌ Menos eficiente

**Decisión:** Job diario (simplicidad y eficiencia)

---

**Opción B: TTL automático (si la DB lo soporta)**
- ✅ Automático
- ❌ PostgreSQL no tiene TTL nativo (requiere extensiones)
- ❌ Job programado es más simple y mantenible

**Decisión:** Job diario (simplicidad y control total)

---

## 4. Prevención de Errores Puntuales

### Decisión: Múltiples Capas de Protección

**Implementación:**
1. **Validación en el borde:** Rechaza eventos inválidos (400)
2. **Validación en worker:** Filtra corruptos que pasaron (no rompe pipeline)
3. **Reintentos con backoff:** Maneja fallos transitorios
4. **Logging y continuar:** Errores no detienen el sistema

**¿Por qué?**

#### Principio: Un evento malo nunca rompe todo el sistema

#### Capas de Protección:

**Capa 1: Validación en el Borde**
```typescript
// Evento inválido → 400 Bad Request
// Nunca entra al buffer
```

**Capa 2: Validación en Worker**
```typescript
// Evento corrupto que pasó el borde
// Se filtra, se descarta, se loggea
// Pipeline continúa con eventos válidos
```

**Capa 3: Reintentos con Backoff**
```typescript
// Fallo transitorio (DB lenta)
// Reintenta con exponential backoff
// Si falla permanentemente → Log y continuar
```

**Capa 4: Logging y Continuar**
```typescript
// Cualquier error → Log
// Sistema nunca crashea
// Continúa procesando otros eventos
```

#### Alternativas Consideradas:

**Opción A: Failsafe (detener todo si hay error)**
- ❌ Un evento malo rompe todo el sistema
- ❌ No resiliente
- ❌ Pérdida masiva de eventos

**Decisión:** Múltiples capas (resiliencia > perfección)

---

**Opción B: Dead Letter Queue (DLQ)**
- ✅ Preserva eventos fallidos
- ❌ Complejidad adicional
- ❌ No necesario para MVP

**Decisión:** Logging para MVP (DLQ en futuro si es necesario)

---

## 5. Checkpoint para Recuperación

### Decisión: Checkpoint Periódico en Disco

**Implementación:**
- Guarda buffer en disco cada 5 segundos
- Recupera al iniciar si existe checkpoint
- Escritura atómica (temp file + rename)

**¿Por qué?**

#### Ventajas:
1. **Recuperación ante crashes:** Recupera eventos del buffer
2. **Pérdida mínima:** Máximo 5 segundos de eventos perdidos
3. **Simplicidad:** Solo archivos en disco
4. **Sin infraestructura:** No requiere Redis/Kafka

#### Trade-offs:
1. **I/O de disco:** Escribe cada 5 segundos
   - **Mitigación:** Operación asíncrona, no bloquea
2. **Espacio en disco:** ~25 MB máximo (50,000 eventos por defecto)
   - **Mitigación:** Se elimina después de cargar
3. **Pérdida de eventos recientes:** Últimos 0-5 segundos
   - **Mitigación:** Aceptable para MVP

#### Alternativas Consideradas:

**Opción A: Sin checkpoint (aceptar pérdida en crash)**
- ❌ Pérdida de hasta 50,000 eventos en crash (si no hay checkpoint)
- ❌ No resiliente

**Decisión:** Checkpoint (recuperación > pérdida)

---

**Opción B: Checkpoint en cada evento (sincrónico)**
- ❌ Muy lento (I/O en cada evento)
- ❌ Bloquea request path
- ❌ Overhead enorme

**Decisión:** Checkpoint periódico (balance entre pérdida y performance)

---

## 6. Estructura de Índices

### Decisión: Índice Compuesto (service, timestamp)

**Implementación:**
```sql
CREATE INDEX idx_service_timestamp ON events(service, timestamp);
```

**¿Por qué?**

#### Queries Principales:
```sql
-- Query típica (optimizada por índice)
SELECT * FROM events
WHERE service = 'auth-service'
  AND timestamp >= '2024-01-15T00:00:00Z'
  AND timestamp <= '2024-01-15T23:59:59Z'
ORDER BY timestamp DESC
LIMIT 10 OFFSET 0;
```

#### Ventajas del Índice Compuesto:
1. **Cubre ambos filtros:** service y timestamp
2. **Ordenamiento eficiente:** timestamp ya está ordenado
3. **Paginación rápida:** LIMIT/OFFSET eficiente

#### Trade-offs:
1. **Espacio:** Índice ocupa espacio
   - **Mitigación:** Trade-off aceptable
2. **Escrituras más lentas:** Índice debe actualizarse
   - **Mitigación:** Batch inserts reducen impacto

---

## 7. Circuit Breaker para Base de Datos

### Decisión: Circuit Breaker con 3 Estados

**Implementación:**
- Estados: CLOSED (normal) → OPEN (rechaza) → HALF_OPEN (testing)
- Configuración: 5 fallos para abrir, 2 éxitos para cerrar, 30s timeout
- Protege todas las operaciones de DB (batchInsert, queries, deleteOldEvents)

**¿Por qué?**

#### Ventajas:
1. **Previene cascading failures:** Si DB está caída, no satura el sistema
2. **Auto-recuperación:** Detecta cuando DB se restaura
3. **Protección automática:** No requiere intervención manual

#### Trade-offs:
1. **Complejidad adicional:** Más código que mantener
   - **Mitigación:** Servicio centralizado, fácil de usar
2. **Latencia en recovery:** 30 segundos antes de intentar HALF_OPEN
   - **Mitigación:** Aceptable para MVP, configurable

#### Alternativas Consideradas:

**Opción A: Sin Circuit Breaker**
- ❌ Sistema puede saturarse si DB está caída
- ❌ No hay auto-recuperación

**Decisión:** Circuit Breaker (resiliencia > simplicidad)

---

## 8. Repository Pattern

### Decisión: Interfaz IEventRepository con Implementación TypeORM

**Implementación:**
- Interfaz `IEventRepository` define contrato
- Implementación `TypeOrmEventRepository` con TypeORM
- Dependency Injection con token (`EVENT_REPOSITORY_TOKEN`)

**¿Por qué?**

#### Ventajas:
1. **Testeable:** Fácil mockear para tests
2. **Migrable:** Fácil cambiar implementación (PostgreSQL, MongoDB, etc.)
3. **Separación de responsabilidades:** Lógica de negocio separada de acceso a datos

#### Trade-offs:
1. **Complejidad adicional:** Más capas de abstracción
   - **Mitigación:** Beneficio a largo plazo supera complejidad

#### Alternativas Consideradas:

**Opción A: Acceso directo a Repository de TypeORM**
- ❌ Difícil de testear
- ❌ Acoplamiento fuerte con TypeORM

**Decisión:** Repository Pattern (testabilidad y migrabilidad)

---

## 9. ErrorLogger Centralizado

### Decisión: Utilidad Centralizada para Logging

**Implementación:**
- Clase `ErrorLogger` con métodos estáticos
- Métodos: `logError()`, `logWarning()`, `createContext()`
- Contexto estructurado (eventId, service, parámetros)

**¿Por qué?**

#### Ventajas:
1. **Consistencia:** Todos los logs tienen mismo formato
2. **Contexto rico:** Siempre incluye información relevante
3. **Mantenibilidad:** Un solo lugar para cambiar formato

#### Trade-offs:
1. **Dependencia adicional:** Todos los servicios dependen de ErrorLogger
   - **Mitigación:** Utilidad simple, bajo acoplamiento

#### Alternativas Consideradas:

**Opción A: Logging directo con Logger de NestJS**
- ❌ Formato inconsistente
- ❌ Contexto variable o faltante

**Decisión:** ErrorLogger centralizado (consistencia > simplicidad)

---

## 10. Optimizaciones del Buffer

### Decisión: bufferHead para Evitar O(n) shift()

**Implementación:**
- `bufferHead` índice del primer elemento activo
- `getSize()` retorna `buffer.length - bufferHead`
- Compactación periódica cuando `bufferHead > buffer.length / 2`

**¿Por qué?**

#### Ventajas:
1. **Performance:** Drenado O(n) una vez, no O(n) por elemento
2. **Eficiencia:** Evita shift() costoso en cada drenado
3. **Memoria:** Compactación previene crecimiento ilimitado

#### Trade-offs:
1. **Complejidad adicional:** Más código que mantener
   - **Mitigación:** Beneficio de performance justifica complejidad

#### Alternativas Consideradas:

**Opción A: Usar shift() directamente**
- ❌ O(n) por elemento (muy lento para batches grandes)
- ❌ Performance degradada

**Decisión:** bufferHead (performance > simplicidad)

---

## Resumen de Decisiones

| Decisión | Opción Elegida | Razón Principal | Trade-off |
|----------|----------------|-----------------|-----------|
| Buffer | Memoria optimizado | Simplicidad + Performance | Complejidad adicional |
| Almacenamiento | PostgreSQL | Escalabilidad y concurrencia | Requiere Docker |
| Batching | 5,000 eventos, 1s | Balance throughput/latencia | Latencia de 1s máximo |
| Backpressure | 429 explícito | Protección y transparencia | Cliente debe retry |
| Retención | Job diario | Simplicidad | Latencia de 24h |
| Checkpoint | Cada 5s (streaming) | Recuperación + Memoria | I/O periódico |
| Índices | Compuesto (service, timestamp) | Optimiza queries reales | Espacio adicional |
| Circuit Breaker | 3 estados | Resiliencia | Complejidad adicional |
| Repository Pattern | Interfaz + Implementación | Testabilidad + Migrabilidad | Más capas |
| ErrorLogger | Centralizado | Consistencia | Dependencia adicional |
| Validación | Optimizada (chunked) | Performance en batches grandes | Complejidad |
| Rate Limiting | @Throttle | Protección contra abuso | Configuración adicional |

---

## Principios Guía

1. **Simplicidad > Complejidad:** Elegir la opción más simple que funcione
2. **Resiliencia > Perfección:** Sistema nunca se rompe por un error
3. **Observabilidad:** Métricas y logging integrados
4. **Migrabilidad:** Fácil migrar a soluciones más escalables
5. **MVP First:** Optimizar para MVP, planificar para futuro

