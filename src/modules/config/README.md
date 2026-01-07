# Config Module

Módulo de configuración que proporciona objetos de configuración tipados mediante inyección de dependencias.

## Características

- ✅ Configuración tipada con interfaces TypeScript
- ✅ Inyección de dependencias mediante tokens
- ✅ Módulo global (disponible en todos los módulos sin import explícito)
- ✅ Fácil de mockear en tests
- ✅ Separación de concerns por grupo de configuración

## Estructura

```
config/
├── interfaces/          # Interfaces de configuración por grupo
├── tokens/              # Tokens de inyección
├── config-factory.ts    # Funciones factory para crear configuraciones
├── config.module.ts     # Módulo NestJS
├── envs.ts              # Validación y lectura de variables de entorno
└── index.ts             # Exports principales
```

## Uso

### 1. Importar el módulo en el AppModule

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './modules/config';

@Module({
  imports: [
    ConfigModule, // Módulo global, disponible en todos los módulos
    // ... otros módulos
  ],
})
export class AppModule {}
```

### 2. Inyectar configuración en servicios

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG_TOKENS, CircuitBreakerConfig } from '../config';

@Injectable()
export class CircuitBreakerService {
  constructor(
    @Inject(CONFIG_TOKENS.CIRCUIT_BREAKER)
    private readonly config: CircuitBreakerConfig,
  ) {
    // Usar config en lugar de acceder a envs directamente
    console.log(config.failureThreshold);
    console.log(config.successThreshold);
    console.log(config.timeoutMs);
  }
}
```

### 3. Ejemplo completo

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  CONFIG_TOKENS,
  BatchWorkerConfig,
  BufferConfig,
  CircuitBreakerConfig,
} from '../config';

@Injectable()
export class MyService {
  constructor(
    @Inject(CONFIG_TOKENS.BATCH_WORKER)
    private readonly batchWorkerConfig: BatchWorkerConfig,
    @Inject(CONFIG_TOKENS.BUFFER)
    private readonly bufferConfig: BufferConfig,
    @Inject(CONFIG_TOKENS.CIRCUIT_BREAKER)
    private readonly circuitBreakerConfig: CircuitBreakerConfig,
  ) {}

  someMethod() {
    // Acceder a configuración tipada
    const batchSize = this.batchWorkerConfig.batchSize;
    const maxSize = this.bufferConfig.maxSize;
    const threshold = this.circuitBreakerConfig.failureThreshold;
  }
}
```

## Grupos de Configuración Disponibles

| Token | Interface | Descripción |
|-------|-----------|-------------|
| `CONFIG_TOKENS.SERVER` | `ServerConfig` | Configuración del servidor (port, host, environment) |
| `CONFIG_TOKENS.DATABASE` | `DatabaseConfig` | Configuración de base de datos |
| `CONFIG_TOKENS.BATCH_WORKER` | `BatchWorkerConfig` | Configuración del worker de batches |
| `CONFIG_TOKENS.BUFFER` | `BufferConfig` | Configuración del buffer |
| `CONFIG_TOKENS.RETENTION` | `RetentionConfig` | Configuración de retención |
| `CONFIG_TOKENS.QUERY` | `QueryConfig` | Configuración de queries |
| `CONFIG_TOKENS.SERVICE` | `ServiceConfig` | Configuración del servicio |
| `CONFIG_TOKENS.VALIDATION` | `ValidationConfig` | Configuración de validación |
| `CONFIG_TOKENS.CHECKPOINT` | `CheckpointConfig` | Configuración de checkpointing |
| `CONFIG_TOKENS.CIRCUIT_BREAKER` | `CircuitBreakerConfig` | Configuración del circuit breaker |
| `CONFIG_TOKENS.SHUTDOWN` | `ShutdownConfig` | Configuración de shutdown |
| `CONFIG_TOKENS.METRICS` | `MetricsConfig` | Configuración de métricas |
| `CONFIG_TOKENS.RATE_LIMITING` | `RateLimitingConfig` | Configuración de rate limiting |

## Testing

Para tests, puedes mockear fácilmente la configuración:

```typescript
import { Test } from '@nestjs/testing';
import { CONFIG_TOKENS, CircuitBreakerConfig } from '../config';
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

## Migración desde `envs`

### Antes (acoplamiento fuerte):
```typescript
import { envs } from '../config/envs';

constructor() {
  this.config = {
    failureThreshold: envs.circuitBreakerFailureThreshold,
    successThreshold: envs.circuitBreakerSuccessThreshold,
    timeout: envs.circuitBreakerTimeoutMs,
  };
}
```

### Después (inyección de dependencias):
```typescript
import { Inject } from '@nestjs/common';
import { CONFIG_TOKENS, CircuitBreakerConfig } from '../config';

constructor(
  @Inject(CONFIG_TOKENS.CIRCUIT_BREAKER)
  private readonly config: CircuitBreakerConfig,
) {}
```

## Beneficios

1. **Testabilidad**: Fácil de mockear en tests
2. **Tipado**: TypeScript ayuda a detectar errores en tiempo de compilación
3. **Desacoplamiento**: Los servicios no dependen de `envs` directamente
4. **Flexibilidad**: Puedes cambiar la fuente de configuración sin modificar servicios
5. **Mantenibilidad**: Código más limpio y fácil de mantener

## Compatibilidad

El módulo mantiene compatibilidad hacia atrás exportando `envs` para servicios que aún no han migrado.

