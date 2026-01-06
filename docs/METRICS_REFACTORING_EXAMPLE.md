# Ejemplo de Refactorización: De Métricas Invasivas a Servicio Centralizado

## Comparación Antes/Después

### BatchWorkerService - ANTES ❌

```typescript
export class BatchWorkerService {
  // ❌ Estado de métricas mezclado con el servicio
  private readonly performanceMetrics = {
    totalBatchesProcessed: 0,
    totalEventsProcessed: 0,
    totalInsertTimeMs: 0,
    averageBatchProcessingTimeMs: 0,
  };

  private async executeBatchProcessing(): Promise<EnrichedEvent[]> {
    const batch = this.eventBufferService.drain(requestedBatchSize);
    
    // ❌ Tracking manual de tiempo
    const insertStartTime = Date.now();
    const { successful, failed } = await this.eventService.insert(batch);
    const insertTimeMs = Date.now() - insertStartTime;

    // ❌ Actualización manual de métricas en lógica de negocio
    this.performanceMetrics.totalInsertTimeMs += insertTimeMs;
    
    // ... más lógica
    return batch;
  }

  private async process() {
    const batchStartTime = Date.now();
    let batch: EnrichedEvent[] = [];

    try {
      batch = await this.executeBatchProcessing();
      
      if (batch.length === 0) {
        return;
      }

      // ❌ Método adicional solo para métricas
      const batchProcessingTimeMs = Date.now() - batchStartTime;
      this.updatePerformanceMetrics(batch.length, batchProcessingTimeMs);
      this.logPerformanceMetricsIfNeeded();
    } catch (error) {
      // ...
    }
  }

  // ❌ Métodos privados solo para gestionar métricas
  private updatePerformanceMetrics(
    batchSize: number,
    batchProcessingTimeMs: number,
  ): void {
    this.performanceMetrics.totalBatchesProcessed++;
    this.performanceMetrics.totalEventsProcessed += batchSize;
    this.performanceMetrics.averageBatchProcessingTimeMs =
      (this.performanceMetrics.averageBatchProcessingTimeMs *
        (this.performanceMetrics.totalBatchesProcessed - 1) +
        batchProcessingTimeMs) /
      this.performanceMetrics.totalBatchesProcessed;
  }

  private logPerformanceMetricsIfNeeded(): void {
    if (this.performanceMetrics.totalBatchesProcessed % 100 === 0) {
      const avgInsertTime =
        this.performanceMetrics.totalInsertTimeMs /
        this.performanceMetrics.totalBatchesProcessed;

      this.logger.log(
        `Performance metrics: avg batch time=${this.performanceMetrics.averageBatchProcessingTimeMs.toFixed(2)}ms, ` +
          `avg insert=${avgInsertTime.toFixed(2)}ms`,
      );
    }
  }
}
```

### BatchWorkerService - DESPUÉS ✅

```typescript
export class BatchWorkerService {
  constructor(
    private readonly eventBufferService: EventBufferService,
    private readonly eventService: EventService,
    private readonly metricsCollector: MetricsCollectorService, // ← Inyectado
  ) {}

  // ✅ Sin estado de métricas, sin métodos de métricas

  private async executeBatchProcessing(): Promise<EnrichedEvent[]> {
    const batch = this.eventBufferService.drain(requestedBatchSize);
    
    // ✅ Tracking de tiempo solo para métricas (puede simplificarse más)
    const insertStartTime = Date.now();
    const { successful, failed } = await this.eventService.insert(batch);
    const insertTimeMs = Date.now() - insertStartTime;

    // ✅ Solo notificamos al servicio de métricas
    // (En el futuro, esto podría ser automático con decoradores)
    
    // ... más lógica de negocio limpia
    return batch;
  }

  private async process() {
    const batchStartTime = Date.now();
    let batch: EnrichedEvent[] = [];

    try {
      batch = await this.executeBatchProcessing();
      
      if (batch.length === 0) {
        return;
      }

      // ✅ Una sola llamada, el servicio de métricas hace todo
      const batchProcessingTimeMs = Date.now() - batchStartTime;
      const insertTimeMs = /* obtenido de executeBatchProcessing */;
      
      this.metricsCollector.recordBatchProcessed(
        batch.length,
        batchProcessingTimeMs,
        insertTimeMs
      );
    } catch (error) {
      // ...
    }
  }

  // ✅ Sin métodos privados de métricas
  // ✅ Código más limpio y enfocado en lógica de negocio
}
```

### EventBufferService - ANTES ❌

```typescript
export class EventBufferService {
  // ❌ Estado de métricas mezclado
  private readonly metrics = {
    totalEnqueued: 0,
    totalDropped: 0,
    startTime: Date.now(),
    lastEnqueueTime: 0,
    lastDrainTime: 0,
  };

  public enqueue(event: EnrichedEvent): boolean {
    if (this.isFull()) {
      // ❌ Actualización manual de métricas
      this.metrics.totalDropped++;
      return false;
    }
    
    this.buffer.push(event);
    // ❌ Actualización manual de métricas
    this.metrics.totalEnqueued++;
    this.metrics.lastEnqueueTime = Date.now();
    return true;
  }

  public drain(maxSize: number): EnrichedEvent[] {
    // ... lógica de drain
    // ❌ Actualización manual de métricas
    this.metrics.lastDrainTime = Date.now();
    return batch;
  }

  public getMetrics(): MetricsDto {
    // ❌ Cálculos complejos mezclados con lógica de negocio
    const currentTime = Date.now();
    const uptimeSeconds = (currentTime - this.metrics.startTime) / 1000;
    const currentSize = this.getSize();
    const utilizationPercent = (currentSize / this.maxSize) * 100;
    // ... más cálculos
  }
}
```

### EventBufferService - DESPUÉS ✅

```typescript
export class EventBufferService {
  constructor(
    private readonly metricsCollector: MetricsCollectorService, // ← Inyectado
  ) {
    this.maxSize = envs.bufferMaxSize;
    // ✅ Sin estado de métricas
  }

  public enqueue(event: EnrichedEvent): boolean {
    if (this.isFull()) {
      // ✅ Solo notificación
      this.metricsCollector.recordBufferDrop();
      return false;
    }
    
    this.buffer.push(event);
    // ✅ Solo notificación
    this.metricsCollector.recordBufferEnqueue();
    return true;
  }

  public drain(maxSize: number): EnrichedEvent[] {
    // ... lógica de drain
    // ✅ Solo notificación
    this.metricsCollector.recordBufferDrain();
    return batch;
  }

  public getMetrics(): MetricsDto {
    // ✅ Obtiene métricas del servicio centralizado
    const bufferMetrics = this.metricsCollector.getBufferMetrics();
    const currentTime = Date.now();
    const uptimeSeconds = (currentTime - bufferMetrics.startTime) / 1000;
    const currentSize = this.getSize();
    const utilizationPercent = (currentSize / this.maxSize) * 100;
    
    // ✅ Cálculos de presentación (no de recolección)
    // ...
  }
}
```

## Beneficios Medibles

### Antes:
- **Líneas de código de métricas**: ~80 líneas en BatchWorkerService
- **Métodos relacionados con métricas**: 2 métodos privados
- **Acoplamiento**: Alto (métricas mezcladas con negocio)
- **Testabilidad**: Difícil (métricas hardcodeadas)

### Después:
- **Líneas de código de métricas**: ~5 líneas (solo llamadas)
- **Métodos relacionados con métricas**: 0 (delegado al servicio)
- **Acoplamiento**: Bajo (solo dependencia del servicio)
- **Testabilidad**: Fácil (mock del MetricsCollectorService)

## Próximos Pasos de Mejora

1. **Decoradores automáticos** (futuro):
   ```typescript
   @TrackTiming('batch.processing')
   private async executeBatchProcessing() {
     // El decorador automáticamente mide el tiempo
   }
   ```

2. **Event Emitter** (si necesitamos más desacoplamiento):
   ```typescript
   this.eventEmitter.emit('batch.processed', { batchSize, timeMs });
   // Múltiples listeners pueden procesar el evento
   ```

3. **Métricas asíncronas** (si el overhead importa):
   ```typescript
   // Métricas se procesan en background
   this.metricsCollector.recordBatchProcessedAsync(...);
   ```

