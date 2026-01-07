# Ejemplo de Migración: CircuitBreakerService

Este documento muestra cómo migrar un servicio de usar `envs` directamente a usar inyección de dependencias con `ConfigModule`.

## Antes (Acoplamiento fuerte)

```typescript
// circuit-breaker.service.ts - ANTES
import { Injectable, Logger } from '@nestjs/common';
import { envs } from '../../config/envs';

@Injectable()
export class CircuitBreakerService {
  private readonly config: CircuitBreakerConfig;

  constructor() {
    // ❌ Acceso directo a configuración global
    this.config = {
      failureThreshold: envs.circuitBreakerFailureThreshold,
      successThreshold: envs.circuitBreakerSuccessThreshold,
      timeout: envs.circuitBreakerTimeoutMs,
    };
  }

  // ... resto del código
}
```

### Problemas:
- ❌ Imposible testear sin variables de entorno configuradas
- ❌ Difícil cambiar configuración en runtime
- ❌ No permite diferentes configuraciones por instancia
- ❌ Violación de Dependency Inversion Principle (SOLID)

## Después (Inyección de dependencias)

```typescript
// circuit-breaker.service.ts - DESPUÉS
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG_TOKENS, CircuitBreakerConfig } from '../../config';

@Injectable()
export class CircuitBreakerService {
  constructor(
    // ✅ Inyección de configuración tipada
    @Inject(CONFIG_TOKENS.CIRCUIT_BREAKER)
    private readonly config: CircuitBreakerConfig,
  ) {
    // Configuración ya está disponible y tipada
    // this.config.failureThreshold
    // this.config.successThreshold
    // this.config.timeoutMs
  }

  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Usar this.config en lugar de acceder a envs
    if (this.state === CircuitState.OPEN) {
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime >= this.config.timeoutMs
      ) {
        // ...
      }
    }
    // ... resto del código
  }
}
```

### Beneficios:
- ✅ Fácil de testear con mocks
- ✅ Configuración tipada (TypeScript ayuda)
- ✅ Desacoplado de `envs`
- ✅ Permite diferentes configuraciones por instancia
- ✅ Cumple con principios SOLID

## Testing

### Antes (Difícil):
```typescript
// ❌ Necesitas configurar variables de entorno
describe('CircuitBreakerService', () => {
  beforeEach(() => {
    process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = '5';
    process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD = '2';
    process.env.CIRCUIT_BREAKER_TIMEOUT_MS = '60000';
  });

  // ...
});
```

### Después (Fácil):
```typescript
// ✅ Mock simple y directo
import { Test } from '@nestjs/testing';
import { CONFIG_TOKENS, CircuitBreakerConfig } from '../../config';
import { CircuitBreakerService } from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  const mockConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 2,
    timeoutMs: 60000,
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CircuitBreakerService,
        {
          provide: CONFIG_TOKENS.CIRCUIT_BREAKER,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  it('should use injected config', () => {
    expect(service).toBeDefined();
    // Configuración ya está inyectada y lista para usar
  });
});
```

## Otros Ejemplos de Migración

### EventBufferService

```typescript
// ANTES
import { envs } from '../../config/envs';

constructor() {
  this.maxSize = envs.bufferMaxSize;
  this.checkpointIntervalMs = envs.checkpointIntervalMs;
}

// DESPUÉS
import { CONFIG_TOKENS, BufferConfig, CheckpointConfig } from '../../config';

constructor(
  @Inject(CONFIG_TOKENS.BUFFER)
  private readonly bufferConfig: BufferConfig,
  @Inject(CONFIG_TOKENS.CHECKPOINT)
  private readonly checkpointConfig: CheckpointConfig,
) {
  this.maxSize = bufferConfig.maxSize;
  this.checkpointIntervalMs = checkpointConfig.intervalMs;
}
```

### BatchWorkerService

```typescript
// ANTES
import { envs } from '../../config/envs';

constructor() {
  this.batchSize = envs.batchSize;
  this.drainInterval = envs.drainInterval;
  this.maxRetries = envs.maxRetries;
}

// DESPUÉS
import { CONFIG_TOKENS, BatchWorkerConfig } from '../../config';

constructor(
  @Inject(CONFIG_TOKENS.BATCH_WORKER)
  private readonly config: BatchWorkerConfig,
) {
  this.batchSize = config.batchSize;
  this.drainInterval = config.drainInterval;
  this.maxRetries = config.maxRetries;
}
```

## Checklist de Migración

- [ ] Importar `CONFIG_TOKENS` y las interfaces necesarias
- [ ] Reemplazar acceso a `envs` con inyección de dependencias
- [ ] Agregar `@Inject()` con el token correspondiente
- [ ] Actualizar referencias de `envs.property` a `config.property`
- [ ] Actualizar tests para usar mocks de configuración
- [ ] Verificar que no haya errores de compilación
- [ ] Ejecutar tests para asegurar que todo funciona

## Notas

- El módulo es **global**, no necesitas importarlo en cada módulo
- `envs` sigue disponible para código que aún no ha migrado (compatibilidad hacia atrás)
- Puedes migrar servicios gradualmente, no necesitas hacerlo todo de una vez

