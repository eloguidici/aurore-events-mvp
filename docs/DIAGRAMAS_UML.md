# Diagramas UML del Sistema

Este documento contiene los diagramas de secuencia y arquitectura del sistema de eventos.

---

## 1. Arquitectura de Componentes

```mermaid
flowchart TB
    subgraph External["External"]
        Client[("🖥️ Client<br/>HTTP Requests")]
        Prometheus[("📊 Prometheus<br/>Metrics Collection")]
        Grafana[("📈 Grafana<br/>Dashboards")]
    end

    subgraph API["API Layer"]
        EC[EventsController]
        HC[HealthController]
        PC[PrometheusController]
    end

    subgraph Services["Business Logic"]
        ES[EventsService]
        EBS[EventBufferService]
        BWS[BatchWorkerService]
        RS[RetentionService]
        CBS[CircuitBreakerService]
        HS[HealthService]
    end

    subgraph Repository["Data Access"]
        ER[TypeOrmEventRepository]
        BMR[BusinessMetricsRepository]
    end

    subgraph Storage["Storage"]
        PG[("🐘 PostgreSQL<br/>Events Table")]
        CP[("💾 Checkpoint<br/>File System")]
    end

    %% Client flows
    Client -->|POST /events| EC
    Client -->|GET /events| EC
    Client -->|GET /health/*| HC
    
    %% Monitoring
    Prometheus -->|GET /metrics/prometheus| PC
    Grafana --> Prometheus

    %% API to Services
    EC --> ES
    EC --> EBS
    HC --> HS
    HC --> EBS
    PC --> EBS

    %% Service interactions
    ES --> EBS
    ES --> CBS
    ES --> ER
    BWS -->|"⏰ Every 1s"| EBS
    BWS --> ES
    BWS --> CP
    RS -->|"⏰ Daily 2AM"| ES
    HS --> CBS
    HS --> EBS

    %% Repository to Storage
    ER --> PG
    BMR --> PG
```

---

## 2. Flujo de Ingesta de Eventos

Diagrama de secuencia mostrando el flujo completo desde que el cliente envía un evento hasta que se persiste en la base de datos.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Controller as EventsController
    participant Service as EventsService
    participant Buffer as EventBufferService
    participant Worker as BatchWorkerService
    participant DB as PostgreSQL

    %% Flujo de Ingesta (Sincrónico)
    rect rgb(232, 245, 233)
        Note over Client,Buffer: Flujo Sincrónico (< 5ms)
        Client->>+Controller: POST /events
        Controller->>Controller: Validate DTO (class-validator)
        
        alt Validation Failed
            Controller-->>Client: 400 Bad Request
        end

        Controller->>+Service: ingestEvent(dto)
        Service->>Service: Type Guards validation
        Service->>Service: Enrich event (eventId, ingestedAt)
        
        Service->>+Buffer: enqueue(enrichedEvent)
        
        alt Buffer Full
            Buffer-->>Service: false
            Service-->>Controller: BufferSaturatedException
            Controller-->>Client: 429 Too Many Requests
        end
        
        Buffer-->>-Service: true
        Service-->>-Controller: IngestEventResponseDto
        Controller-->>-Client: 202 Accepted
    end

    %% Procesamiento Asíncrono (Background)
    rect rgb(255, 243, 224)
        Note over Worker,DB: Procesamiento Asíncrono (Background)
        
        loop Every 1 second
            Worker->>+Buffer: drainBatch(5000)
            Buffer-->>-Worker: EnrichedEvent[]
            
            alt Batch not empty
                Worker->>Worker: validateBatch()
                Worker->>Worker: Separate valid/invalid
                
                alt Has invalid events
                    Worker->>Worker: Log & discard invalid
                end
                
                Worker->>+DB: batchInsert(validEvents)
                
                alt Insert Failed
                    DB-->>Worker: Error
                    Worker->>Worker: Retry with backoff
                    Worker->>Buffer: Re-enqueue for retry
                end
                
                DB-->>-Worker: Success
            end
        end
    end
```

---

## 3. Flujo de Consulta de Eventos

Diagrama de secuencia mostrando cómo se procesan las consultas con Circuit Breaker.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Controller as EventsController
    participant Service as EventsService
    participant CB as CircuitBreaker
    participant Repository as TypeOrmEventRepository
    participant DB as PostgreSQL

    Client->>+Controller: GET /events?service=X&from=Y&to=Z
    Controller->>Controller: Validate QueryEventsDto
    
    alt Validation Failed
        Controller-->>Client: 400 Bad Request
    end

    Controller->>+Service: queryEvents(params)
    Service->>Service: Type Guards validation
    
    Service->>+CB: Check state
    
    alt Circuit OPEN
        CB-->>Service: CircuitOpenException
        Service-->>Controller: Error
        Controller-->>Client: 503 Service Unavailable
    end
    
    CB-->>-Service: CLOSED/HALF_OPEN
    
    Service->>+Repository: findByServiceAndTimeRange()
    Repository->>+DB: SELECT with composite index
    
    Note over DB: Index: (service, timestamp)<br/>Optimized for this query
    
    DB-->>-Repository: Results + Count
    Repository-->>-Service: { events, total }
    
    Service->>CB: Record success
    Service-->>-Controller: SearchEventsResponseDto
    Controller-->>-Client: 200 OK { items, total, page }
```

---

## 4. Estados del Circuit Breaker

```mermaid
stateDiagram-v2
    [*] --> CLOSED
    
    CLOSED --> OPEN: Failures >= threshold
    CLOSED --> CLOSED: Success / Failure < threshold
    
    OPEN --> HALF_OPEN: After timeout (30s)
    
    HALF_OPEN --> CLOSED: Test request succeeds
    HALF_OPEN --> OPEN: Test request fails
    
    note right of CLOSED
        Normal operation
        All requests go through
    end note
    
    note right of OPEN
        Fail fast
        Reject all requests immediately
    end note
    
    note right of HALF_OPEN
        Testing recovery
        Allow one test request
    end note
```

---

## 5. Flujo de Retención Automática

```mermaid
sequenceDiagram
    autonumber
    participant Cron as Cron Scheduler
    participant RS as RetentionService
    participant ES as EventsService
    participant Repo as EventRepository
    participant DB as PostgreSQL

    Note over Cron: Daily at 2:00 AM
    
    Cron->>+RS: @Cron('0 2 * * *')
    RS->>RS: Calculate cutoff date (now - 30 days)
    RS->>+ES: deleteOldEvents(retentionDays)
    ES->>+Repo: deleteEventsOlderThan(cutoffDate)
    Repo->>+DB: DELETE FROM events WHERE created_at < cutoff
    DB-->>-Repo: { affected: N }
    Repo-->>-ES: deletedCount
    ES-->>-RS: deletedCount
    RS->>RS: Log "Deleted N events older than 30 days"
    RS-->>-Cron: Complete
```

---

## 6. Flujo de Dead Letter Queue (DLQ)

Diagrama mostrando cuándo y cómo los eventos fallidos se almacenan en DLQ para revisión y reprocesamiento manual.

```mermaid
sequenceDiagram
    autonumber
    participant Worker as BatchWorkerService
    participant ES as EventsService
    participant Repo as EventRepository
    participant DB as PostgreSQL
    participant DLQ as DeadLetterQueueService
    participant DLQDB as dead_letter_events

    Worker->>+ES: batchInsert(validEvents)
    ES->>+Repo: batchInsert(events)
    Repo->>+DB: INSERT INTO events (transaction)
    
    alt Insert Success
        DB-->>-Repo: Success
        Repo-->>-ES: insertedCount
        ES-->>-Worker: Success
    else Insert Failed (after max retries)
        DB-->>-Repo: Error (permanent failure)
        Repo-->>-ES: Error
        ES->>+DLQ: storeFailedEvent(event, error)
        DLQ->>+DLQDB: INSERT INTO dead_letter_events
        Note over DLQDB: Stores: event data,<br/>error message,<br/>failure timestamp
        DLQDB-->>-DLQ: Success
        DLQ-->>-ES: storedEventId
        ES-->>-Worker: Event stored in DLQ
        Worker->>Worker: Log "Event stored in DLQ for manual review"
    end
    
    Note over Worker,DLQDB: Events in DLQ can be:<br/>- Reviewed via GET /dlq<br/>- Reprocessed via PATCH /dlq/:id/reprocess<br/>- Statistics via GET /dlq/statistics
```

---

## Leyenda

| Símbolo | Significado |
|---------|-------------|
| 🖥️ | Cliente externo |
| 📊 | Sistema de monitoreo |
| 📈 | Visualización |
| 🐘 | Base de datos PostgreSQL |
| 💾 | Sistema de archivos |
| ⏰ | Proceso programado (scheduled) |
| `rect` verde | Flujo sincrónico |
| `rect` naranja | Flujo asíncrono |

---

## Notas

- Los diagramas usan [Mermaid](https://mermaid.js.org/), que GitHub renderiza automáticamente
- Para ver los diagramas localmente, usar extensión de VS Code o [Mermaid Live Editor](https://mermaid.live/)

---

## 🖼️ Cómo Ver los Diagramas Visualmente

### Opción 1: En GitHub (Más Fácil) ✅
1. Sube los archivos a GitHub
2. Abre `docs/DIAGRAMAS_UML.md` en GitHub
3. Los diagramas se renderizan automáticamente como gráficos

### Opción 2: Mermaid Live Editor (En el Navegador) 🌐
1. Ve a: **https://mermaid.live/**
2. Copia el código de un diagrama (por ejemplo, desde la línea 9 hasta la línea 72 del primer diagrama)
3. Pega el código en el editor
4. Verás el diagrama renderizado instantáneamente

**Ejemplo para el primer diagrama:**
- Copiar desde ````mermaid` hasta ```` (líneas 9-72)
- Pegar en https://mermaid.live/
- Ver el gráfico renderizado

### Opción 3: Extensión de VS Code 🔌
Instala una de estas extensiones en VS Code:

**Recomendada: "Markdown Preview Mermaid Support"**
1. Abre VS Code
2. Ve a Extensiones (Ctrl+Shift+X)
3. Busca: `Markdown Preview Mermaid Support`
4. Instala la extensión
5. Abre `docs/DIAGRAMAS_UML.md`
6. Presiona `Ctrl+Shift+V` (o `Cmd+Shift+V` en Mac) para ver el preview
7. Los diagramas Mermaid se renderizarán como gráficos

**Otras opciones:**
- `Mermaid Preview` - Preview dedicado para Mermaid
- `Markdown Preview Enhanced` - Preview avanzado con soporte Mermaid

### Opción 4: Visor de Markdown Online 📄
1. Ve a: **https://dillinger.io/** o **https://stackedit.io/**
2. Copia el contenido de `docs/DIAGRAMAS_UML.md`
3. Pega en el editor
4. Verás los diagramas renderizados

---

## 💡 Recomendación Rápida

**Para ver rápido sin instalar nada:**
1. Ve a **https://mermaid.live/**
2. Copia y pega el código de cualquier diagrama
3. Verás el gráfico al instante

**Para uso diario:**
- Instala la extensión `Markdown Preview Mermaid Support` en VS Code
- Presiona `Ctrl+Shift+V` cuando estés editando el archivo
