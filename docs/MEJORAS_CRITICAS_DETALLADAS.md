# 🔴 Mejoras Críticas de Alta Prioridad - Guía de Implementación Detallada

Este documento proporciona una guía completa y detallada para implementar las 3 mejoras críticas identificadas en el proyecto **aurore-events-mvp**.

---

## ⚠️ NOTA IMPORTANTE: CONTEXTO POC

**Este documento describe mejoras críticas para PRODUCCIÓN, NO para POC.**

**Contexto del Proyecto:** Este es un **POC (Proof of Concept)** basado en el Practical Test de Aurore Labs. Las mejoras críticas descritas en este documento (Autenticación, Migraciones, Backups) **NO se deben implementar para un POC** porque:

1. ❌ Agregan complejidad innecesaria
2. ❌ Ralentizan el desarrollo
3. ❌ El objetivo del POC es demostrar el concepto, no ser producción-ready

**Recomendación:**
- ⚠️ **NO implementar estas mejoras para POC**
- ✅ **Implementar solo cuando el POC se convierta en producto real**
- ✅ **Mantener esta documentación como referencia futura**

**Para evaluación de mejoras para POC, ver:** `docs/MEJORAS_PENDIENTES_EVALUACION.md` o `docs/RESUMEN_POC.md`

**Si el POC se convierte en producción real**, entonces sí implementar las mejoras críticas descritas en este documento.

---

## 📋 Tabla de Contenidos

1. [🔐 Seguridad - Autenticación y Autorización con API Keys](#1-seguridad---autenticación-y-autorización-con-api-keys)
2. [🗄️ Base de Datos - Migraciones de TypeORM](#2-base-de-datos---migraciones-de-typeorm)
3. [💾 Backup y Recuperación - Estrategia Documentada](#3-backup-y-recuperación---estrategia-documentada)

---

## 1. 🔐 Seguridad - Autenticación y Autorización con API Keys

### 1.1 Problema Actual

**Situación:** El sistema actualmente no tiene autenticación ni autorización. Cualquiera puede:
- Enviar eventos sin restricciones
- Consultar todos los eventos de la base de datos
- Acceder a métricas y health checks sin límites
- Potencialmente causar denegación de servicio (DoS)

**Riesgo:** 🔴 **CRÍTICO**
- Exposición de datos sensibles
- Abuso del sistema
- Pérdida de datos
- Costos imprevistos
- No cumplimiento de normativas (GDPR, HIPAA, etc.)

**Impacto en Producción:**
- **Seguridad:** Bajo (sin protección)
- **Compliance:** No cumple estándares
- **Costos:** Potencialmente ilimitados
- **Reputación:** Riesgo alto

---

### 1.2 Solución Propuesta

Implementar **autenticación basada en API Keys** con:
- API Keys únicas por cliente
- Rate limiting por API Key
- Rotación de keys
- Auditoría de acceso
- Revocación de keys

---

### 1.3 Arquitectura de la Solución

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTE                               │
│  Envía request con header: X-API-KEY: abc123...         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              API KEY GUARD (Middleware)                  │
│  1. Extrae API Key del header                            │
│  2. Valida formato (hash, longitud)                      │
│  3. Consulta base de datos                               │
│  4. Verifica estado (activo, no expirado)                │
│  5. Registra intento de acceso                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              API KEY SERVICE                             │
│  - Validación de keys                                    │
│  - Consulta de permisos                                  │
│  - Rate limiting por key                                 │
│  - Auditoría                                             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         CONTROLADOR (EventController, etc.)              │
│  - Acceso autorizado                                     │
│  - Cliente identificado                                  │
└─────────────────────────────────────────────────────────┘
```

---

### 1.4 Implementación Paso a Paso

#### Paso 1: Crear Entidad de API Key

```typescript
// src/modules/auth/entities/api-key.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('api_keys')
@Index(['keyHash'], { unique: true })
@Index(['clientId'])
@Index(['isActive', 'expiresAt'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', length: 100 })
  clientId: string;

  @Column({ name: 'key_hash', length: 255 })
  keyHash: string; // Hash SHA-256 del API key

  @Column({ name: 'key_name', length: 200, nullable: true })
  keyName: string; // Nombre descriptivo (opcional)

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'rate_limit_per_minute', default: 10000 })
  rateLimitPerMinute: number; // Rate limit específico por key

  @Column({ name: 'rate_limit_per_hour', default: 300000 })
  rateLimitPerHour: number;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null; // Fecha de expiración (opcional)

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'usage_count', default: 0 })
  usageCount: number; // Contador de usos

  @Column({ name: 'created_by', length: 100, nullable: true })
  createdBy: string; // Usuario/admin que creó la key

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Método helper para verificar si la key está expirada
  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  // Método helper para verificar si la key es válida
  isValid(): boolean {
    return this.isActive && !this.isExpired();
  }
}
```

---

#### Paso 2: Crear DTOs para Gestión de API Keys

```typescript
// src/modules/auth/dto/create-api-key.dto.ts
import { IsString, IsOptional, IsNumber, Min, Max, IsDateString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({
    description: 'Identificador único del cliente',
    example: 'client-123',
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @Length(3, 100)
  clientId: string;

  @ApiPropertyOptional({
    description: 'Nombre descriptivo de la API key (opcional)',
    example: 'Production Key - Web App',
    maxLength: 200,
  })
  @IsString()
  @Length(1, 200)
  @IsOptional()
  keyName?: string;

  @ApiPropertyOptional({
    description: 'Rate limit por minuto para esta key',
    example: 5000,
    default: 10000,
    minimum: 1,
    maximum: 100000,
  })
  @IsNumber()
  @Min(1)
  @Max(100000)
  @IsOptional()
  rateLimitPerMinute?: number;

  @ApiPropertyOptional({
    description: 'Rate limit por hora para esta key',
    example: 300000,
    default: 300000,
    minimum: 100,
    maximum: 1000000,
  })
  @IsNumber()
  @Min(100)
  @Max(1000000)
  @IsOptional()
  rateLimitPerHour?: number;

  @ApiPropertyOptional({
    description: 'Fecha de expiración de la key (ISO 8601)',
    example: '2024-12-31T23:59:59Z',
  })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional({
    description: 'Usuario/admin que crea la key',
    example: 'admin@example.com',
  })
  @IsString()
  @IsOptional()
  createdBy?: string;
}

// src/modules/auth/dto/api-key-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ApiKeyResponseDto {
  @ApiProperty({ description: 'ID único de la API key' })
  id: string;

  @ApiProperty({ description: 'Identificador del cliente' })
  clientId: string;

  @ApiProperty({ description: 'API Key generada (solo se muestra una vez)' })
  apiKey: string; // Solo en creación

  @ApiProperty({ description: 'Nombre descriptivo de la key' })
  keyName: string | null;

  @ApiProperty({ description: 'Indica si la key está activa' })
  isActive: boolean;

  @ApiProperty({ description: 'Rate limit por minuto' })
  rateLimitPerMinute: number;

  @ApiProperty({ description: 'Rate limit por hora' })
  rateLimitPerHour: number;

  @ApiProperty({ description: 'Fecha de expiración' })
  expiresAt: Date | null;

  @ApiProperty({ description: 'Fecha de creación' })
  createdAt: Date;

  @ApiProperty({ description: 'Último uso' })
  lastUsedAt: Date | null;

  @ApiProperty({ description: 'Contador de usos' })
  usageCount: number;
}
```

---

#### Paso 3: Crear Servicio de API Keys

```typescript
// src/modules/auth/services/api-key.service.ts
import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { CreateApiKeyDto } from '../dto/create-api-key.dto';
import { ApiKeyResponseDto } from '../dto/api-key-response.dto';
import { ApiKey } from '../entities/api-key.entity';

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);
  private readonly API_KEY_PREFIX = 'auk_'; // Aurore Key
  private readonly API_KEY_LENGTH = 32; // Longitud del token (sin prefijo)

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  /**
   * Genera una nueva API key única
   * Formato: auk_[32 caracteres hex]
   */
  private generateApiKey(): string {
    const randomToken = randomBytes(this.API_KEY_LENGTH).toString('hex');
    return `${this.API_KEY_PREFIX}${randomToken}`;
  }

  /**
   * Hashea un API key usando SHA-256
   */
  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Valida el formato de un API key
   */
  validateApiKeyFormat(apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }
    
    const regex = new RegExp(`^${this.API_KEY_PREFIX}[a-f0-9]{${this.API_KEY_LENGTH * 2}}$`);
    return regex.test(apiKey);
  }

  /**
   * Crea una nueva API key
   */
  async createApiKey(dto: CreateApiKeyDto): Promise<ApiKeyResponseDto> {
    // Verificar si ya existe una key activa para este cliente
    const existingKey = await this.apiKeyRepository.findOne({
      where: {
        clientId: dto.clientId,
        isActive: true,
      },
    });

    if (existingKey) {
      this.logger.warn(`Active API key already exists for client: ${dto.clientId}`);
      // Opcional: Podríamos permitir múltiples keys activas
      // throw new ConflictException(`Active API key already exists for client: ${dto.clientId}`);
    }

    // Generar nueva API key
    const apiKey = this.generateApiKey();
    const keyHash = this.hashApiKey(apiKey);

    // Preparar fecha de expiración
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    // Crear entidad
    const apiKeyEntity = this.apiKeyRepository.create({
      clientId: dto.clientId,
      keyHash,
      keyName: dto.keyName || null,
      isActive: true,
      rateLimitPerMinute: dto.rateLimitPerMinute || 10000,
      rateLimitPerHour: dto.rateLimitPerHour || 300000,
      expiresAt,
      createdBy: dto.createdBy || null,
    });

    // Guardar en base de datos
    const savedKey = await this.apiKeyRepository.save(apiKeyEntity);

    this.logger.log(`API key created for client: ${dto.clientId} (ID: ${savedKey.id})`);

    // Retornar con la key en texto plano (solo esta vez)
    return {
      id: savedKey.id,
      clientId: savedKey.clientId,
      apiKey, // ⚠️ Solo se muestra una vez
      keyName: savedKey.keyName,
      isActive: savedKey.isActive,
      rateLimitPerMinute: savedKey.rateLimitPerMinute,
      rateLimitPerHour: savedKey.rateLimitPerHour,
      expiresAt: savedKey.expiresAt,
      createdAt: savedKey.createdAt,
      lastUsedAt: savedKey.lastUsedAt,
      usageCount: savedKey.usageCount,
    };
  }

  /**
   * Valida un API key y retorna la entidad si es válida
   */
  async validateApiKey(apiKey: string): Promise<ApiKey | null> {
    // Validar formato
    if (!this.validateApiKeyFormat(apiKey)) {
      this.logger.debug('Invalid API key format');
      return null;
    }

    // Hashear y buscar en base de datos
    const keyHash = this.hashApiKey(apiKey);
    const apiKeyEntity = await this.apiKeyRepository.findOne({
      where: { keyHash },
    });

    if (!apiKeyEntity) {
      this.logger.debug('API key not found in database');
      return null;
    }

    // Verificar si está activa
    if (!apiKeyEntity.isActive) {
      this.logger.warn(`Inactive API key attempted access: ${apiKeyEntity.clientId}`);
      return null;
    }

    // Verificar expiración
    if (apiKeyEntity.isExpired()) {
      this.logger.warn(`Expired API key attempted access: ${apiKeyEntity.clientId}`);
      return null;
    }

    // Actualizar último uso
    apiKeyEntity.lastUsedAt = new Date();
    apiKeyEntity.usageCount += 1;
    await this.apiKeyRepository.save(apiKeyEntity);

    return apiKeyEntity;
  }

  /**
   * Lista todas las API keys (solo para admin)
   */
  async listApiKeys(clientId?: string): Promise<ApiKey[]> {
    const where: any = {};
    if (clientId) {
      where.clientId = clientId;
    }

    return this.apiKeyRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Obtiene una API key por ID
   */
  async getApiKeyById(id: string): Promise<ApiKey> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
    if (!apiKey) {
      throw new NotFoundException(`API key not found: ${id}`);
    }
    return apiKey;
  }

  /**
   * Revoca (desactiva) una API key
   */
  async revokeApiKey(id: string): Promise<void> {
    const apiKey = await this.getApiKeyById(id);
    apiKey.isActive = false;
    await this.apiKeyRepository.save(apiKey);
    this.logger.log(`API key revoked: ${id} (client: ${apiKey.clientId})`);
  }

  /**
   * Reactiva una API key
   */
  async reactivateApiKey(id: string): Promise<void> {
    const apiKey = await this.getApiKeyById(id);
    apiKey.isActive = true;
    await this.apiKeyRepository.save(apiKey);
    this.logger.log(`API key reactivated: ${id} (client: ${apiKey.clientId})`);
  }

  /**
   * Limpia keys expiradas (llamar periódicamente)
   */
  async cleanupExpiredKeys(): Promise<number> {
    const expiredKeys = await this.apiKeyRepository.find({
      where: {
        expiresAt: LessThan(new Date()),
        isActive: true,
      },
    });

    for (const key of expiredKeys) {
      key.isActive = false;
    }

    if (expiredKeys.length > 0) {
      await this.apiKeyRepository.save(expiredKeys);
      this.logger.log(`Deactivated ${expiredKeys.length} expired API keys`);
    }

    return expiredKeys.length;
  }
}
```

---

#### Paso 4: Crear Guard para Autenticación

```typescript
// src/modules/auth/guards/api-key.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyService } from '../services/api-key.service';
import { ApiKey } from '../entities/api-key.entity';

/**
 * Guard que valida API keys en requests HTTP
 * Extrae la API key del header X-API-KEY y valida contra la base de datos
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKeyFromRequest(request);

    if (!apiKey) {
      this.logger.debug('No API key provided in request');
      throw new UnauthorizedException('API key required. Please provide X-API-KEY header.');
    }

    // Validar API key
    const apiKeyEntity = await this.apiKeyService.validateApiKey(apiKey);

    if (!apiKeyEntity) {
      this.logger.warn(`Invalid API key attempted access from IP: ${request.ip}`);
      throw new UnauthorizedException('Invalid or expired API key.');
    }

    // Agregar información del cliente al request para uso posterior
    request['clientId'] = apiKeyEntity.clientId;
    request['apiKey'] = apiKeyEntity; // Entidad completa para rate limiting

    this.logger.debug(`Authenticated request from client: ${apiKeyEntity.clientId}`);
    return true;
  }

  /**
   * Extrae la API key del request
   * Busca en header X-API-KEY o Authorization: Bearer [key]
   */
  private extractApiKeyFromRequest(request: Request): string | null {
    // Primero intentar header X-API-KEY
    const apiKeyHeader = request.headers['x-api-key'];
    if (apiKeyHeader && typeof apiKeyHeader === 'string') {
      return apiKeyHeader.trim();
    }

    // Alternativamente, buscar en Authorization: Bearer [key]
    const authHeader = request.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        return parts[1].trim();
      }
    }

    return null;
  }
}

// src/modules/auth/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// src/modules/auth/guards/api-key.guard.ts (actualizado con soporte para @Public())
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiKeyService } from '../services/api-key.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Verificar si la ruta está marcada como pública
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // Permitir acceso sin autenticación
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKeyFromRequest(request);

    if (!apiKey) {
      this.logger.debug('No API key provided in request');
      throw new UnauthorizedException('API key required. Please provide X-API-KEY header.');
    }

    const apiKeyEntity = await this.apiKeyService.validateApiKey(apiKey);

    if (!apiKeyEntity) {
      this.logger.warn(`Invalid API key attempted access from IP: ${request.ip}`);
      throw new UnauthorizedException('Invalid or expired API key.');
    }

    request['clientId'] = apiKeyEntity.clientId;
    request['apiKey'] = apiKeyEntity;

    this.logger.debug(`Authenticated request from client: ${apiKeyEntity.clientId}`);
    return true;
  }

  private extractApiKeyFromRequest(request: Request): string | null {
    const apiKeyHeader = request.headers['x-api-key'];
    if (apiKeyHeader && typeof apiKeyHeader === 'string') {
      return apiKeyHeader.trim();
    }

    const authHeader = request.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        return parts[1].trim();
      }
    }

    return null;
  }
}
```

---

#### Paso 5: Crear Rate Limiter por API Key

```typescript
// src/modules/auth/guards/api-key-rate-limit.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  TooManyRequestsException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKey } from '../entities/api-key.entity';

/**
 * Guard que aplica rate limiting basado en la API key del request
 * Usa un mapa en memoria para rastrear requests por API key
 */
@Injectable()
export class ApiKeyRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyRateLimitGuard.name);
  
  // Mapa para rastrear requests por API key
  // Estructura: Map<apiKeyId, { minute: { count, resetAt }, hour: { count, resetAt } }>
  private readonly requestCounts = new Map<
    string,
    {
      minute: { count: number; resetAt: number };
      hour: { count: number; resetAt: number };
    }
  >();

  private readonly CLEANUP_INTERVAL_MS = 60000; // 1 minuto
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Limpiar entradas expiradas periódicamente
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.CLEANUP_INTERVAL_MS);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey: ApiKey | undefined = request['apiKey'];

    // Si no hay API key en el request, permitir (el ApiKeyGuard ya validó)
    if (!apiKey) {
      return true;
    }

    const now = Date.now();
    const apiKeyId = apiKey.id;

    // Obtener o inicializar contadores para esta API key
    let counters = this.requestCounts.get(apiKeyId);
    if (!counters) {
      counters = {
        minute: { count: 0, resetAt: now + 60000 },
        hour: { count: 0, resetAt: now + 3600000 },
      };
      this.requestCounts.set(apiKeyId, counters);
    }

    // Resetear contadores si expiraron
    if (now >= counters.minute.resetAt) {
      counters.minute = { count: 0, resetAt: now + 60000 };
    }
    if (now >= counters.hour.resetAt) {
      counters.hour = { count: 0, resetAt: now + 3600000 };
    }

    // Incrementar contadores
    counters.minute.count += 1;
    counters.hour.count += 1;

    // Verificar límites
    const minuteLimit = apiKey.rateLimitPerMinute;
    const hourLimit = apiKey.rateLimitPerHour;

    if (counters.minute.count > minuteLimit) {
      this.logger.warn(
        `Rate limit exceeded (per minute) for client: ${apiKey.clientId} (${counters.minute.count}/${minuteLimit})`,
      );
      throw new TooManyRequestsException(
        `Rate limit exceeded. Maximum ${minuteLimit} requests per minute allowed.`,
      );
    }

    if (counters.hour.count > hourLimit) {
      this.logger.warn(
        `Rate limit exceeded (per hour) for client: ${apiKey.clientId} (${counters.hour.count}/${hourLimit})`,
      );
      throw new TooManyRequestsException(
        `Rate limit exceeded. Maximum ${hourLimit} requests per hour allowed.`,
      );
    }

    // Actualizar contadores
    this.requestCounts.set(apiKeyId, counters);

    return true;
  }

  /**
   * Limpia entradas expiradas del mapa para liberar memoria
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [apiKeyId, counters] of this.requestCounts.entries()) {
      // Si ambos contadores expiraron hace más de 1 hora, eliminar entrada
      if (now > counters.minute.resetAt + 3600000 && now > counters.hour.resetAt) {
        expiredKeys.push(apiKeyId);
      }
    }

    for (const key of expiredKeys) {
      this.requestCounts.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.logger.debug(`Cleaned up ${expiredKeys.length} expired rate limit entries`);
    }
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
```

**Nota:** Para producción con múltiples instancias, usar Redis para rate limiting compartido:

```typescript
// src/modules/auth/guards/api-key-rate-limit-redis.guard.ts
import { Injectable, CanActivate, ExecutionContext, TooManyRequestsException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class ApiKeyRateLimitRedisGuard implements CanActivate {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey: ApiKey = request['apiKey'];

    if (!apiKey) return true;

    const now = Date.now();
    const apiKeyId = apiKey.id;

    // Rate limiting por minuto
    const minuteKey = `rate_limit:${apiKeyId}:minute`;
    const minuteCount = await this.redis.incr(minuteKey);
    
    if (minuteCount === 1) {
      await this.redis.expire(minuteKey, 60);
    }

    if (minuteCount > apiKey.rateLimitPerMinute) {
      throw new TooManyRequestsException(`Rate limit exceeded. Maximum ${apiKey.rateLimitPerMinute} requests per minute.`);
    }

    // Rate limiting por hora
    const hourKey = `rate_limit:${apiKeyId}:hour`;
    const hourCount = await this.redis.incr(hourKey);
    
    if (hourCount === 1) {
      await this.redis.expire(hourKey, 3600);
    }

    if (hourCount > apiKey.rateLimitPerHour) {
      throw new TooManyRequestsException(`Rate limit exceeded. Maximum ${apiKey.rateLimitPerHour} requests per hour.`);
    }

    return true;
  }
}
```

---

#### Paso 6: Crear Controlador para Gestión de API Keys

```typescript
// src/modules/auth/controllers/api-key.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ApiKeyService } from '../services/api-key.service';
import { CreateApiKeyDto } from '../dto/create-api-key.dto';
import { ApiKeyResponseDto } from '../dto/api-key-response.dto';
// import { AdminGuard } from '../guards/admin.guard'; // Implementar si hay roles

@ApiTags('API Keys')
@Controller('api-keys')
// @UseGuards(AdminGuard) // Proteger con admin guard si es necesario
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear nueva API key',
    description: 'Genera una nueva API key para un cliente. La key se muestra solo una vez.',
  })
  @ApiResponse({
    status: 201,
    description: 'API key creada exitosamente',
    type: ApiKeyResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Ya existe una API key activa para este cliente' })
  async createApiKey(@Body() dto: CreateApiKeyDto): Promise<ApiKeyResponseDto> {
    return this.apiKeyService.createApiKey(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar API keys',
    description: 'Lista todas las API keys, opcionalmente filtradas por clientId',
  })
  @ApiQuery({ name: 'clientId', required: false, description: 'Filtrar por client ID' })
  @ApiResponse({ status: 200, description: 'Lista de API keys' })
  async listApiKeys(@Query('clientId') clientId?: string) {
    const keys = await this.apiKeyService.listApiKeys(clientId);
    return {
      keys: keys.map(key => ({
        id: key.id,
        clientId: key.clientId,
        keyName: key.keyName,
        isActive: key.isActive,
        rateLimitPerMinute: key.rateLimitPerMinute,
        rateLimitPerHour: key.rateLimitPerHour,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        usageCount: key.usageCount,
        createdAt: key.createdAt,
      })),
      // No incluir keyHash ni apiKey en texto plano
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener API key por ID' })
  @ApiResponse({ status: 200, description: 'Detalles de la API key' })
  @ApiResponse({ status: 404, description: 'API key no encontrada' })
  async getApiKey(@Param('id') id: string) {
    const key = await this.apiKeyService.getApiKeyById(id);
    return {
      id: key.id,
      clientId: key.clientId,
      keyName: key.keyName,
      isActive: key.isActive,
      rateLimitPerMinute: key.rateLimitPerMinute,
      rateLimitPerHour: key.rateLimitPerHour,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      usageCount: key.usageCount,
      createdAt: key.createdAt,
    };
  }

  @Patch(':id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revocar (desactivar) API key' })
  @ApiResponse({ status: 204, description: 'API key revocada exitosamente' })
  @ApiResponse({ status: 404, description: 'API key no encontrada' })
  async revokeApiKey(@Param('id') id: string): Promise<void> {
    await this.apiKeyService.revokeApiKey(id);
  }

  @Patch(':id/reactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reactivar API key' })
  @ApiResponse({ status: 204, description: 'API key reactivada exitosamente' })
  @ApiResponse({ status: 404, description: 'API key no encontrada' })
  async reactivateApiKey(@Param('id') id: string): Promise<void> {
    await this.apiKeyService.reactivateApiKey(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar API key permanentemente' })
  @ApiResponse({ status: 204, description: 'API key eliminada exitosamente' })
  @ApiResponse({ status: 404, description: 'API key no encontrada' })
  async deleteApiKey(@Param('id') id: string): Promise<void> {
    // Implementar soft delete o hard delete según necesidad
    await this.apiKeyService.revokeApiKey(id);
  }
}
```

---

#### Paso 7: Crear Módulo de Autenticación

```typescript
// src/modules/auth/auth.module.ts
import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ApiKey } from './entities/api-key.entity';
import { ApiKeyService } from './services/api-key.service';
import { ApiKeyController } from './controllers/api-key.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ApiKeyRateLimitGuard } from './guards/api-key-rate-limit.guard';

@Global() // Módulo global para que esté disponible en toda la app
@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  controllers: [ApiKeyController],
  providers: [
    ApiKeyService,
    {
      provide: APP_GUARD, // Guard global para todas las rutas
      useClass: ApiKeyGuard,
    },
    {
      provide: 'RATE_LIMIT_GUARD', // Rate limit guard (opcional hacerlo global)
      useClass: ApiKeyRateLimitGuard,
    },
  ],
  exports: [ApiKeyService], // Exportar servicio para uso en otros módulos
})
export class AuthModule {}
```

---

#### Paso 8: Actualizar App Module

```typescript
// src/app.module.ts (actualizar)
import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module'; // Agregar
// ... otros imports

@Module({
  imports: [
    // ... otros módulos
    AuthModule, // Agregar antes de otros módulos
    EventModule,
    // ...
  ],
  // ...
})
export class AppModule {}
```

---

#### Paso 9: Actualizar Controladores Existentes

```typescript
// src/modules/event/controllers/events.controller.ts (actualizar)
import { Controller, Post, Get, Body, Request } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator'; // Agregar
import { UseGuards } from '@nestjs/common';
import { ApiKeyRateLimitGuard } from '../../auth/guards/api-key-rate-limit.guard'; // Agregar

@Controller()
export class EventController {
  // ...

  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(ApiKeyRateLimitGuard) // Agregar rate limiting por API key
  // No usar @Public() - requiere autenticación
  async ingestEvent(
    @Body() createEventDto: CreateEventDto,
    @Request() req: Request, // req['clientId'] y req['apiKey'] disponibles
  ): Promise<IngestResponseDto> {
    const clientId = req['clientId']; // Obtener clientId del request
    // ... resto del código
  }

  @Get('events')
  @UseGuards(ApiKeyRateLimitGuard) // Agregar rate limiting
  async queryEvents(@Query() queryDto: QueryEventsDto, @Request() req: Request) {
    const clientId = req['clientId'];
    // ... resto del código
  }

  @Get('health')
  @Public() // Health check puede ser público
  async healthCheck() {
    // ... resto del código
  }
}
```

---

#### Paso 10: Migración de Base de Datos

```typescript
// migrations/1234567890-CreateApiKeysTable.ts
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateApiKeysTable1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'api_keys',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'client_id',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'key_hash',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'key_name',
            type: 'varchar',
            length: '200',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'rate_limit_per_minute',
            type: 'integer',
            default: 10000,
          },
          {
            name: 'rate_limit_per_hour',
            type: 'integer',
            default: 300000,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'usage_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'created_by',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Crear índices
    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'IDX_API_KEYS_KEY_HASH',
        columnNames: ['key_hash'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'IDX_API_KEYS_CLIENT_ID',
        columnNames: ['client_id'],
      }),
    );

    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'IDX_API_KEYS_ACTIVE_EXPIRES',
        columnNames: ['is_active', 'expires_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('api_keys');
  }
}
```

---

### 1.5 Variables de Entorno

```env
# .env (agregar)
# API Key Configuration
API_KEY_PREFIX=auk_
API_KEY_LENGTH=32

# Rate Limiting (valores por defecto, pueden sobrescribirse por key)
DEFAULT_RATE_LIMIT_PER_MINUTE=10000
DEFAULT_RATE_LIMIT_PER_HOUR=300000

# Cleanup de keys expiradas (cron job)
API_KEY_CLEANUP_CRON=0 2 * * * # Diario a las 2 AM
```

---

### 1.6 Tests

```typescript
// src/modules/auth/specs/services/api-key.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyService } from '../services/api-key.service';
import { ApiKey } from '../entities/api-key.entity';

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let repository: Repository<ApiKey>;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: getRepositoryToken(ApiKey),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
    repository = module.get<Repository<ApiKey>>(getRepositoryToken(ApiKey));
  });

  describe('createApiKey', () => {
    it('should create a new API key', async () => {
      const dto: CreateApiKeyDto = {
        clientId: 'client-123',
        keyName: 'Test Key',
      };

      mockRepository.findOne.mockResolvedValue(null); // No existe key activa
      mockRepository.create.mockReturnValue({
        id: 'uuid-123',
        clientId: dto.clientId,
        keyHash: 'hash123',
        keyName: dto.keyName,
        isActive: true,
        // ... otros campos
      });
      mockRepository.save.mockResolvedValue({
        id: 'uuid-123',
        // ... campos guardados
      });

      const result = await service.createApiKey(dto);

      expect(result).toHaveProperty('apiKey');
      expect(result.apiKey).toMatch(/^auk_[a-f0-9]{64}$/); // Formato correcto
      expect(result.clientId).toBe(dto.clientId);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw error if active key already exists', async () => {
      const dto: CreateApiKeyDto = {
        clientId: 'client-123',
      };

      mockRepository.findOne.mockResolvedValue({ id: 'existing-key' }); // Ya existe

      await expect(service.createApiKey(dto)).rejects.toThrow();
    });
  });

  describe('validateApiKey', () => {
    it('should validate a correct API key', async () => {
      const apiKey = 'auk_' + 'a'.repeat(64);
      const keyHash = service['hashApiKey'](apiKey);

      const mockApiKeyEntity = {
        id: 'uuid-123',
        clientId: 'client-123',
        keyHash,
        isActive: true,
        expiresAt: null,
        lastUsedAt: null,
        usageCount: 0,
        isExpired: () => false,
      };

      mockRepository.findOne.mockResolvedValue(mockApiKeyEntity);
      mockRepository.save.mockResolvedValue(mockApiKeyEntity);

      const result = await service.validateApiKey(apiKey);

      expect(result).toBeDefined();
      expect(result.clientId).toBe('client-123');
      expect(mockRepository.save).toHaveBeenCalled(); // Actualizar lastUsedAt
    });

    it('should return null for invalid format', async () => {
      const result = await service.validateApiKey('invalid-key');
      expect(result).toBeNull();
    });

    it('should return null for inactive key', async () => {
      const apiKey = 'auk_' + 'a'.repeat(64);
      const keyHash = service['hashApiKey'](apiKey);

      mockRepository.findOne.mockResolvedValue({
        id: 'uuid-123',
        isActive: false,
        expiresAt: null,
      });

      const result = await service.validateApiKey(apiKey);
      expect(result).toBeNull();
    });
  });
});
```

---

### 1.7 Ejemplo de Uso

```bash
# 1. Crear API key
curl -X POST http://localhost:3000/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-123",
    "keyName": "Production Key",
    "rateLimitPerMinute": 5000,
    "rateLimitPerHour": 300000
  }'

# Respuesta:
# {
#   "id": "uuid-123",
#   "clientId": "client-123",
#   "apiKey": "auk_abc123...def456", // ⚠️ Solo se muestra una vez
#   "keyName": "Production Key",
#   ...
# }

# 2. Usar API key para enviar eventos
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: auk_abc123...def456" \
  -d '{
    "timestamp": "2024-01-15T10:30:00.000Z",
    "service": "auth-service",
    "message": "User login",
    "metadata": {}
  }'

# 3. Listar API keys
curl -X GET http://localhost:3000/api-keys?clientId=client-123 \
  -H "X-API-KEY: admin-key"

# 4. Revocar API key
curl -X PATCH http://localhost:3000/api-keys/uuid-123/revoke \
  -H "X-API-KEY: admin-key"
```

---

### 1.8 Checklist de Implementación

- [ ] Crear entidad `ApiKey`
- [ ] Crear DTOs (`CreateApiKeyDto`, `ApiKeyResponseDto`)
- [ ] Implementar `ApiKeyService`
- [ ] Crear `ApiKeyGuard`
- [ ] Crear `ApiKeyRateLimitGuard` (en memoria o Redis)
- [ ] Crear `ApiKeyController`
- [ ] Crear `AuthModule`
- [ ] Agregar migración de base de datos
- [ ] Actualizar `AppModule`
- [ ] Actualizar controladores existentes
- [ ] Marcar rutas públicas con `@Public()`
- [ ] Agregar tests unitarios
- [ ] Agregar tests E2E
- [ ] Documentar en Swagger
- [ ] Crear script de cleanup de keys expiradas
- [ ] Configurar variables de entorno

---

### 1.9 Consideraciones Adicionales

#### Seguridad
- **Nunca** loguear API keys en texto plano
- Almacenar solo hashes en base de datos
- Usar HTTPS en producción
- Implementar rotación de keys periódica
- Agregar IP whitelisting (opcional)

#### Performance
- Cachear API keys válidas (Redis) para reducir consultas a BD
- Usar índices apropiados en base de datos
- Limpiar entradas de rate limiting periódicamente

#### Monitoreo
- Alertar cuando una key está cerca de expirar
- Alertar sobre intentos de acceso fallidos
- Monitorear rate limiting hits
- Trackear uso por cliente

---

## 2. 🗄️ Base de Datos - Migraciones de TypeORM

### 2.1 Problema Actual

**Situación:** El sistema actualmente usa `DB_SYNCHRONIZE=true`, lo cual significa que TypeORM modifica automáticamente el esquema de la base de datos en cada inicio de la aplicación.

**Riesgo:** 🔴 **CRÍTICO**
- **Pérdida de datos**: TypeORM puede eliminar columnas/tablas si la entidad cambia
- **Sin control de versiones**: No hay historial de cambios de esquema
- **Imposible rollback**: No se puede revertir cambios de esquema
- **Riesgo en producción**: Cambios inesperados pueden corromper la base de datos
- **No reproducible**: No hay forma de replicar el esquema exacto en otro ambiente

**Impacto en Producción:**
- **Confianza:** Baja (cambios no controlados)
- **Rollback:** Imposible
- **Auditoría:** Sin historial
- **Reproducibilidad:** Difícil

---

### 2.2 Solución Propuesta

Implementar **migraciones de TypeORM** para:
- Control de versiones del esquema
- Rollback de cambios
- Reproducibilidad en todos los ambientes
- Auditoría de cambios
- Deployment seguro en producción

---

### 2.3 Arquitectura de la Solución

```
┌─────────────────────────────────────────────────────────┐
│              DEVELOPMENT WORKFLOW                        │
│  1. Modificar entidad (Event, ApiKey, etc.)              │
│  2. Generar migración: npm run migration:generate        │
│  3. Revisar migración generada                           │
│  4. Ejecutar migración: npm run migration:run            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              PRODUCTION WORKFLOW                         │
│  1. Commit migraciones al repositorio                    │
│  2. Deploy código                                         │
│  3. Ejecutar migraciones: npm run migration:run          │
│  4. Verificar aplicación funciona                        │
│  5. Si hay problemas: npm run migration:revert           │
└─────────────────────────────────────────────────────────┘
```

---

### 2.4 Implementación Paso a Paso

#### Paso 1: Configurar TypeORM para Migraciones

```typescript
// src/config/typeorm.config.ts
import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'admin',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_DATABASE || 'aurore_events',
  
  // ⚠️ IMPORTANTE: Deshabilitar synchronize en producción
  synchronize: false, // NUNCA usar true en producción
  
  logging: process.env.DB_LOGGING === 'true',
  
  // Configuración de migraciones
  migrations: [join(__dirname, '../migrations/**/*.ts')],
  migrationsTableName: 'migrations', // Tabla que guarda historial de migraciones
  migrationsRun: false, // No ejecutar automáticamente (ejecutar manualmente)
  
  // Entidades
  entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
  
  // Cliente de conexión
  extra: {
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    timezone: 'UTC',
  },
};

// DataSource para ejecutar migraciones desde CLI
export default new DataSource(dataSourceOptions);
```

---

#### Paso 2: Actualizar tsconfig.json

```json
// tsconfig.json (actualizar)
{
  "compilerOptions": {
    // ... opciones existentes
    "outDir": "./dist",
    "rootDir": "./",
  },
  "include": [
    "src/**/*",
    "migrations/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/common copy/**"
  ]
}
```

---

#### Paso 3: Crear Directorio de Migraciones

```bash
# Crear directorio para migraciones
mkdir -p migrations

# Crear archivo .gitkeep para mantener el directorio en git
touch migrations/.gitkeep
```

---

#### Paso 4: Configurar Scripts en package.json

```json
// package.json (actualizar scripts)
{
  "scripts": {
    // ... scripts existentes
    
    // Scripts de migración
    "migration:generate": "typeorm-ts-node-commonjs migration:generate -d src/config/typeorm.config.ts",
    "migration:create": "typeorm-ts-node-commonjs migration:create",
    "migration:run": "typeorm-ts-node-commonjs migration:run -d src/config/typeorm.config.ts",
    "migration:revert": "typeorm-ts-node-commonjs migration:revert -d src/config/typeorm.config.ts",
    "migration:show": "typeorm-ts-node-commonjs migration:show -d src/config/typeorm.config.ts",
    
    // Scripts de build para migraciones
    "build:migrations": "tsc -p tsconfig.json --outDir dist"
  },
  
  "devDependencies": {
    // ... dependencias existentes
    // typeorm CLI ya está incluido en @nestjs/typeorm
  }
}
```

**Nota:** Si TypeORM CLI no está disponible, instalar:

```bash
npm install --save-dev ts-node typeorm
```

---

#### Paso 5: Crear Migración Inicial del Esquema

**IMPORTANTE:** Antes de crear migraciones, debemos:

1. **Deshabilitar synchronize:**
   ```env
   # .env
   DB_SYNCHRONIZE=false
   ```

2. **Crear migración inicial basada en las entidades existentes:**

```bash
# Generar migración inicial (TypeORM detectará diferencias)
npm run migration:generate -- migrations/InitialSchema

# O crear migración manual si no hay diferencias detectadas
npm run migration:create -- migrations/InitialSchema
```

**Ejemplo de migración inicial:**

```typescript
// migrations/1705312345678-InitialSchema.ts
import { MigrationInterface, QueryRunner, Table, TableIndex, TableColumn } from 'typeorm';

export class InitialSchema1705312345678 implements MigrationInterface {
  name = 'InitialSchema1705312345678';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Crear tabla de eventos
    await queryRunner.createTable(
      new Table({
        name: 'event',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '50',
            isPrimary: true,
          },
          {
            name: 'event_id',
            type: 'varchar',
            length: '50',
            isUnique: true,
          },
          {
            name: 'timestamp',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'service',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'ingested_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Crear índices para tabla de eventos
    await queryRunner.createIndex(
      'event',
      new TableIndex({
        name: 'IDX_EVENT_SERVICE_TIMESTAMP',
        columnNames: ['service', 'timestamp'],
      }),
    );

    await queryRunner.createIndex(
      'event',
      new TableIndex({
        name: 'IDX_EVENT_TIMESTAMP',
        columnNames: ['timestamp'],
      }),
    );

    await queryRunner.createIndex(
      'event',
      new TableIndex({
        name: 'IDX_EVENT_SERVICE',
        columnNames: ['service'],
      }),
    );

    // Índice GIN para búsquedas JSONB (PostgreSQL)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EVENT_METADATA_GIN" 
      ON "event" USING gin ("metadata" jsonb_path_ops);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índices primero
    await queryRunner.dropIndex('event', 'IDX_EVENT_METADATA_GIN');
    await queryRunner.dropIndex('event', 'IDX_EVENT_SERVICE');
    await queryRunner.dropIndex('event', 'IDX_EVENT_TIMESTAMP');
    await queryRunner.dropIndex('event', 'IDX_EVENT_SERVICE_TIMESTAMP');
    
    // Eliminar tabla
    await queryRunner.dropTable('event');
  }
}
```

---

#### Paso 6: Actualizar app.module.ts

```typescript
// src/app.module.ts (actualizar)
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './modules/event/entities/event.entity';
import { envs } from './modules/config/envs';

@Module({
  imports: [
    // ... otros imports
    
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: envs.dbHost,
      port: envs.dbPort,
      username: envs.dbUsername,
      password: envs.dbPassword,
      database: envs.dbDatabase,
      
      // ⚠️ IMPORTANTE: Deshabilitar synchronize
      synchronize: false, // NUNCA usar true en producción
      
      logging: envs.dbLogging,
      
      // Cargar entidades
      entities: [Event], // Agregar otras entidades aquí (ApiKey, etc.)
      
      // Migraciones (opcional: ejecutar automáticamente en startup)
      // migrations: ['dist/migrations/**/*.js'],
      // migrationsRun: false, // Ejecutar manualmente con npm run migration:run
      
      extra: {
        max: envs.dbPoolMax,
        timezone: 'UTC',
      },
    }),
    
    // ... otros módulos
  ],
})
export class AppModule {}
```

---

#### Paso 7: Crear Script de Ejecución de Migraciones

```typescript
// scripts/run-migrations.ts
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'admin',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_DATABASE || 'aurore_events',
  synchronize: false,
  logging: true,
  migrations: [join(__dirname, '../migrations/**/*.ts')],
  migrationsTableName: 'migrations',
});

async function runMigrations() {
  try {
    console.log('Initializing database connection...');
    await dataSource.initialize();
    
    console.log('Running migrations...');
    const migrations = await dataSource.runMigrations();
    
    if (migrations.length === 0) {
      console.log('No pending migrations.');
    } else {
      console.log(`Executed ${migrations.length} migration(s):`);
      migrations.forEach(migration => {
        console.log(`  - ${migration.name}`);
      });
    }
    
    await dataSource.destroy();
    console.log('Migrations completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error running migrations:', error);
    await dataSource.destroy();
    process.exit(1);
  }
}

runMigrations();
```

**Actualizar package.json:**

```json
{
  "scripts": {
    "migration:run": "ts-node scripts/run-migrations.ts",
    "migration:revert": "ts-node scripts/revert-migrations.ts"
  }
}
```

---

#### Paso 8: Crear Migración para API Keys (ejemplo)

```typescript
// migrations/1705320000000-CreateApiKeysTable.ts
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateApiKeysTable1705320000000 implements MigrationInterface {
  name = 'CreateApiKeysTable1705320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'api_keys',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'client_id',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'key_hash',
            type: 'varchar',
            length: '255',
          },
          // ... resto de columnas (ver sección 1.4)
        ],
      }),
      true,
    );

    // Crear índices
    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'IDX_API_KEYS_KEY_HASH',
        columnNames: ['key_hash'],
        isUnique: true,
      }),
    );
    // ... otros índices
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('api_keys');
  }
}
```

---

#### Paso 9: Ejemplo de Migración de Modificación

```typescript
// migrations/1705330000000-AddIndexToEventTable.ts
import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddIndexToEventTable1705330000000 implements MigrationInterface {
  name = 'AddIndexToEventTable1705330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregar nuevo índice
    await queryRunner.createIndex(
      'event',
      new TableIndex({
        name: 'IDX_EVENT_INGESTED_AT',
        columnNames: ['ingested_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índice en rollback
    await queryRunner.dropIndex('event', 'IDX_EVENT_INGESTED_AT');
  }
}
```

---

#### Paso 10: Ejemplo de Migración de Modificación de Columna

```typescript
// migrations/1705340000000-AlterEventMessageColumn.ts
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AlterEventMessageColumn1705340000000 implements MigrationInterface {
  name = 'AlterEventMessageColumn1705340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Modificar tipo de columna (ejemplo: aumentar tamaño)
    await queryRunner.changeColumn(
      'event',
      'message',
      new TableColumn({
        name: 'message',
        type: 'text', // Cambiar de varchar(2000) a text
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir cambio
    await queryRunner.changeColumn(
      'event',
      'message',
      new TableColumn({
        name: 'message',
        type: 'varchar',
        length: '2000',
        isNullable: false,
      }),
    );
  }
}
```

---

### 2.5 Workflow de Desarrollo

#### Desarrollo Local:

```bash
# 1. Modificar entidad (ej: agregar campo)
# src/modules/event/entities/event.entity.ts
@Column({ name: 'new_field', nullable: true })
newField: string;

# 2. Generar migración automáticamente
npm run migration:generate -- migrations/AddNewFieldToEvent

# 3. Revisar migración generada
# migrations/1705350000000-AddNewFieldToEvent.ts

# 4. Ejecutar migración
npm run migration:run

# 5. Verificar cambios en base de datos
# psql -U admin -d aurore_events -c "\d event"

# 6. Si hay problemas, revertir migración
npm run migration:revert
```

#### Producción:

```bash
# 1. Verificar migraciones pendientes (sin ejecutarlas)
npm run migration:show

# 2. Backup de base de datos (IMPORTANTE)
npm run db:backup

# 3. Ejecutar migraciones
npm run migration:run

# 4. Verificar aplicación funciona correctamente
# Health checks, tests, etc.

# 5. Si hay problemas, revertir
npm run migration:revert
# Restaurar backup si es necesario
npm run db:restore <backup-file>
```

---

### 2.6 Integración con CI/CD

```yaml
# .github/workflows/migrations.yml
name: Database Migrations

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check-migrations:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: admin
          POSTGRES_PASSWORD: admin
          POSTGRES_DB: aurore_events
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build migrations
        run: npm run build:migrations
      
      - name: Check migration syntax
        run: npm run migration:show
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_USERNAME: admin
          DB_PASSWORD: admin
          DB_DATABASE: aurore_events
      
      - name: Test migrations (dry-run)
        run: npm run migration:run
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_USERNAME: admin
          DB_PASSWORD: admin
          DB_DATABASE: aurore_events
```

---

### 2.7 Variables de Entorno

```env
# .env (actualizar)
# ⚠️ IMPORTANTE: Deshabilitar synchronize
DB_SYNCHRONIZE=false

# Migraciones (opcional)
MIGRATIONS_RUN_ON_STARTUP=false # Ejecutar manualmente en producción
MIGRATIONS_TABLE_NAME=migrations
```

---

### 2.8 Checklist de Implementación

- [ ] Crear archivo de configuración de TypeORM (`typeorm.config.ts`)
- [ ] Deshabilitar `synchronize` en `.env` y `app.module.ts`
- [ ] Crear directorio `migrations/`
- [ ] Agregar scripts de migración en `package.json`
- [ ] Crear migración inicial del esquema
- [ ] Ejecutar migración inicial
- [ ] Verificar que la aplicación funciona correctamente
- [ ] Actualizar `app.module.ts` para usar migraciones
- [ ] Crear script de ejecución de migraciones
- [ ] Documentar workflow de desarrollo
- [ ] Documentar workflow de producción
- [ ] Agregar migraciones al control de versiones
- [ ] Configurar CI/CD para validar migraciones
- [ ] Crear backup antes de ejecutar migraciones en producción

---

### 2.9 Consideraciones Adicionales

#### Seguridad
- **Siempre** hacer backup antes de ejecutar migraciones en producción
- Revisar migraciones generadas antes de ejecutarlas
- Probar migraciones en ambiente de staging primero
- Tener plan de rollback preparado

#### Performance
- Migraciones grandes pueden tardar tiempo (agregar índices puede ser costoso)
- Considerar ejecutar migraciones durante ventana de mantenimiento
- Usar transacciones para operaciones críticas
- Considerar migraciones offline para cambios grandes

#### Best Practices
- **Nunca** modificar migraciones ejecutadas (crear nueva migración)
- Mantener migraciones atómicas (una responsabilidad por migración)
- Documentar migraciones complejas
- Usar nombres descriptivos: `AddIndexToEventTable`, `CreateApiKeysTable`

---

## 3. 💾 Backup y Recuperación - Estrategia Documentada

### 3.1 Problema Actual

**Situación:** No hay estrategia documentada ni automatizada de backup y recuperación de la base de datos.

**Riesgo:** 🔴 **CRÍTICO**
- **Pérdida de datos**: Sin backups regulares, pérdida de datos permanente
- **Downtime prolongado**: Sin plan de recuperación, tiempo de recuperación desconocido
- **Sin auditoría**: No hay historial de backups
- **No probado**: No se sabe si los backups funcionan hasta que es tarde

**Impacto en Producción:**
- **RPO (Recovery Point Objective):** Desconocido (pérdida potencial de todas las transacciones)
- **RTO (Recovery Time Objective):** Desconocido (tiempo de recuperación indefinido)
- **Confianza:** Baja (sin garantía de recuperación)
- **Compliance:** No cumple estándares (GDPR requiere backups)

---

### 3.2 Solución Propuesta

Implementar **estrategia completa de backup y recuperación** con:
- Backups automáticos regulares
- Backup antes de migraciones
- Backups incrementales y completos
- Retención configurable
- Scripts de restauración
- Documentación completa
- Tests de restauración periódicos

---

### 3.3 Arquitectura de la Solución

```
┌─────────────────────────────────────────────────────────┐
│              BACKUP AUTOMÁTICO (Diario)                  │
│  Cron: 0 2 * * * (2 AM diario)                           │
│  1. Backup completo de PostgreSQL                         │
│  2. Comprimir backup                                      │
│  3. Guardar en storage (local/S3)                         │
│  4. Retener últimos N backups                             │
│  5. Notificar éxito/fallo                                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              BACKUP PRE-MIGRACIÓN                        │
│  Antes de ejecutar migraciones:                          │
│  1. Backup automático                                     │
│  2. Verificar integridad                                  │
│  3. Ejecutar migración                                    │
│  4. Si falla: restaurar backup                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              RESTAURACIÓN                                │
│  1. Listar backups disponibles                           │
│  2. Seleccionar backup                                    │
│  3. Restaurar base de datos                               │
│  4. Verificar integridad                                  │
└─────────────────────────────────────────────────────────┘
```

---

### 3.4 Implementación Paso a Paso

#### Paso 1: Crear Script de Backup Local

```bash
#!/bin/bash
# scripts/backup-database.sh

set -euo pipefail

# Configuración
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/aurore_events_$DATE.sql"
COMPRESSED_FILE="$BACKUP_FILE.gz"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Variables de entorno (desde .env o docker-compose)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-admin}"
DB_PASSWORD="${DB_PASSWORD:-admin}"
DB_DATABASE="${DB_DATABASE:-aurore_events}"

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

echo "Starting database backup..."
echo "Database: $DB_DATABASE"
echo "Host: $DB_HOST:$DB_PORT"
echo "Backup file: $BACKUP_FILE"

# Exportar password como variable de entorno para pg_dump
export PGPASSWORD="$DB_PASSWORD"

# Backup completo de PostgreSQL
if command -v docker-compose &> /dev/null; then
  # Si usa Docker Compose
  docker-compose exec -T postgres pg_dump -U "$DB_USERNAME" -d "$DB_DATABASE" > "$BACKUP_FILE"
else
  # Si PostgreSQL está en el host
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_DATABASE" -F c -f "$BACKUP_FILE"
fi

if [ $? -eq 0 ]; then
  echo "Database dump created successfully."
  
  # Comprimir backup
  echo "Compressing backup..."
  gzip -f "$BACKUP_FILE"
  
  if [ $? -eq 0 ]; then
    echo "Backup compressed: $COMPRESSED_FILE"
    
    # Calcular tamaño del backup
    SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)
    echo "Backup size: $SIZE"
    
    # Retener solo backups de últimos N días
    echo "Cleaning up old backups (retention: $RETENTION_DAYS days)..."
    find "$BACKUP_DIR" -name "aurore_events_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
    
    # Listar backups actuales
    echo "Current backups:"
    ls -lh "$BACKUP_DIR"/aurore_events_*.sql.gz 2>/dev/null || echo "No backups found"
    
    echo "Backup completed successfully: $COMPRESSED_FILE"
    exit 0
  else
    echo "Error compressing backup." >&2
    rm -f "$BACKUP_FILE"
    exit 1
  fi
else
  echo "Error creating database dump." >&2
  exit 1
fi

# Limpiar password
unset PGPASSWORD
```

**Hacer ejecutable:**
```bash
chmod +x scripts/backup-database.sh
```

---

#### Paso 2: Crear Script de Backup para Docker

```bash
#!/bin/bash
# scripts/backup-database-docker.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d_%H%M%S)
CONTAINER_NAME="${POSTGRES_CONTAINER:-aurore-postgres}"
DB_NAME="${DB_DATABASE:-aurore_events}"
DB_USER="${DB_USERNAME:-admin}"
BACKUP_FILE="$BACKUP_DIR/aurore_events_$DATE.sql.gz"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

echo "Starting database backup from Docker container: $CONTAINER_NAME"

# Verificar que el contenedor existe y está corriendo
if ! docker ps | grep -q "$CONTAINER_NAME"; then
  echo "Error: Container $CONTAINER_NAME is not running." >&2
  exit 1
fi

# Crear backup comprimido directamente
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "Backup completed successfully: $BACKUP_FILE ($SIZE)"
  
  # Limpiar backups antiguos
  find "$BACKUP_DIR" -name "aurore_events_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
  
  echo "Backup retention: $RETENTION_DAYS days"
  exit 0
else
  echo "Error creating backup." >&2
  exit 1
fi
```

---

#### Paso 3: Crear Script de Restauración

```bash
#!/bin/bash
# scripts/restore-database.sh

set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file.sql.gz>" >&2
  echo "Available backups:" >&2
  ls -1 ./backups/*.sql.gz 2>/dev/null || echo "No backups found" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-admin}"
DB_PASSWORD="${DB_PASSWORD:-admin}"
DB_DATABASE="${DB_DATABASE:-aurore_events}"

echo "⚠️  WARNING: This will replace all data in database: $DB_DATABASE"
echo "Backup file: $BACKUP_FILE"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Restore cancelled."
  exit 0
fi

echo "Starting database restore..."

export PGPASSWORD="$DB_PASSWORD"

# Si el archivo está comprimido, descomprimir primero
if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo "Decompressing backup..."
  TEMP_FILE=$(mktemp)
  gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
  BACKUP_FILE="$TEMP_FILE"
fi

# Restaurar base de datos
if command -v docker-compose &> /dev/null; then
  # Si usa Docker Compose
  docker-compose exec -T postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" < "$BACKUP_FILE"
else
  # Si PostgreSQL está en el host
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_DATABASE" < "$BACKUP_FILE"
fi

RESTORE_EXIT_CODE=$?

# Limpiar archivo temporal si se creó
if [ -n "${TEMP_FILE:-}" ]; then
  rm -f "$TEMP_FILE"
fi

unset PGPASSWORD

if [ $RESTORE_EXIT_CODE -eq 0 ]; then
  echo "Database restored successfully."
  exit 0
else
  echo "Error restoring database." >&2
  exit 1
fi
```

---

#### Paso 4: Crear Servicio de Backup en NestJS

```typescript
// src/modules/backup/services/backup.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  private readonly retentionDays: number;

  constructor() {
    this.backupDir = process.env.BACKUP_DIR || join(process.cwd(), 'backups');
    this.retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10);
  }

  async onModuleInit() {
    // Crear directorio de backups si no existe
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      this.logger.log(`Backup directory initialized: ${this.backupDir}`);
    } catch (error) {
      this.logger.error(`Failed to create backup directory: ${error.message}`);
    }
  }

  /**
   * Ejecutar backup manual
   */
  async createBackup(): Promise<{ success: boolean; file?: string; error?: string }> {
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = join(this.backupDir, `aurore_events_${date}.sql.gz`);

    this.logger.log(`Starting manual backup: ${backupFile}`);

    try {
      const { stdout, stderr } = await execAsync(
        `bash scripts/backup-database-docker.sh`,
        {
          env: {
            ...process.env,
            BACKUP_DIR: this.backupDir,
          },
        },
      );

      if (stderr && !stderr.includes('WARNING')) {
        this.logger.error(`Backup stderr: ${stderr}`);
      }

      this.logger.log(`Backup completed successfully: ${backupFile}`);
      this.logger.debug(stdout);

      return { success: true, file: backupFile };
    } catch (error) {
      this.logger.error(`Backup failed: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Backup automático diario (cron: 2 AM)
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledBackup(): Promise<void> {
    this.logger.log('Starting scheduled daily backup...');
    const result = await this.createBackup();

    if (result.success) {
      this.logger.log(`Scheduled backup completed: ${result.file}`);
      // Enviar notificación de éxito (email, Slack, etc.)
    } else {
      this.logger.error(`Scheduled backup failed: ${result.error}`);
      // Enviar alerta de fallo (email, Slack, etc.)
    }

    // Limpiar backups antiguos después de crear nuevo backup
    await this.cleanupOldBackups();
  }

  /**
   * Limpiar backups antiguos según retención
   */
  async cleanupOldBackups(): Promise<number> {
    try {
      const files = await fs.readdir(this.backupDir);
      const now = Date.now();
      const maxAge = this.retentionDays * 24 * 60 * 60 * 1000; // días a ms
      let deletedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.sql.gz')) continue;

        const filePath = join(this.backupDir, file);
        const stats = await fs.stat(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          await fs.unlink(filePath);
          deletedCount++;
          this.logger.log(`Deleted old backup: ${file} (age: ${Math.round(age / (24 * 60 * 60 * 1000))} days)`);
        }
      }

      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} old backup(s)`);
      }

      return deletedCount;
    } catch (error) {
      this.logger.error(`Error cleaning up old backups: ${error.message}`);
      return 0;
    }
  }

  /**
   * Listar backups disponibles
   */
  async listBackups(): Promise<Array<{ file: string; size: number; created: Date }>> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups: Array<{ file: string; size: number; created: Date }> = [];

      for (const file of files) {
        if (!file.endsWith('.sql.gz')) continue;

        const filePath = join(this.backupDir, file);
        const stats = await fs.stat(filePath);

        backups.push({
          file,
          size: stats.size,
          created: stats.birthtime,
        });
      }

      // Ordenar por fecha de creación (más reciente primero)
      backups.sort((a, b) => b.created.getTime() - a.created.getTime());

      return backups;
    } catch (error) {
      this.logger.error(`Error listing backups: ${error.message}`);
      return [];
    }
  }

  /**
   * Backup antes de migración
   */
  async backupBeforeMigration(): Promise<boolean> {
    this.logger.log('Creating backup before migration...');
    const result = await this.createBackup();

    if (!result.success) {
      this.logger.error(`Pre-migration backup failed: ${result.error}`);
      throw new Error(`Cannot proceed with migration: backup failed - ${result.error}`);
    }

    this.logger.log(`Pre-migration backup created: ${result.file}`);
    return true;
  }
}
```

---

#### Paso 5: Crear Controlador de Backup

```typescript
// src/modules/backup/controllers/backup.controller.ts
import { Controller, Post, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BackupService } from '../services/backup.service';
// import { AdminGuard } from '../../auth/guards/admin.guard'; // Proteger con admin guard

@ApiTags('Backup')
@Controller('backup')
// @UseGuards(AdminGuard) // Proteger endpoints de backup
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post('create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Crear backup manual',
    description: 'Ejecuta un backup manual de la base de datos',
  })
  @ApiResponse({ status: 200, description: 'Backup creado exitosamente' })
  @ApiResponse({ status: 500, description: 'Error al crear backup' })
  async createBackup() {
    const result = await this.backupService.createBackup();
    if (result.success) {
      return {
        message: 'Backup created successfully',
        file: result.file,
      };
    } else {
      throw new Error(`Backup failed: ${result.error}`);
    }
  }

  @Get('list')
  @ApiOperation({
    summary: 'Listar backups disponibles',
    description: 'Retorna lista de backups disponibles con información de tamaño y fecha',
  })
  @ApiResponse({ status: 200, description: 'Lista de backups' })
  async listBackups() {
    const backups = await this.backupService.listBackups();
    return {
      backups: backups.map(b => ({
        file: b.file,
        size: `${(b.size / 1024 / 1024).toFixed(2)} MB`,
        created: b.created.toISOString(),
      })),
      count: backups.length,
    };
  }
}
```

---

#### Paso 6: Integrar Backup con Migraciones

```typescript
// scripts/run-migrations-with-backup.ts
import { BackupService } from '../src/modules/backup/services/backup.service';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runMigrationsWithBackup() {
  console.log('Step 1: Creating backup before migration...');
  
  // Crear backup (usar servicio o script directamente)
  try {
    const { stdout } = await execAsync('bash scripts/backup-database-docker.sh');
    console.log(stdout);
    console.log('Backup created successfully.\n');
  } catch (error) {
    console.error('Backup failed. Aborting migration.', error);
    process.exit(1);
  }

  console.log('Step 2: Running migrations...');
  
  try {
    const { stdout, stderr } = await execAsync('npm run migration:run');
    console.log(stdout);
    if (stderr) console.error(stderr);
    console.log('Migrations completed successfully.\n');
  } catch (error) {
    console.error('Migration failed. Restore backup if needed.', error);
    process.exit(1);
  }

  console.log('Step 3: Verification...');
  // Agregar verificaciones (health checks, tests, etc.)
  
  console.log('Migration process completed successfully.');
}

runMigrationsWithBackup();
```

---

### 3.5 Variables de Entorno

```env
# .env (agregar)
# Backup Configuration
BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=7
BACKUP_CRON_SCHEDULE=0 2 * * * # Diario a las 2 AM

# Notificaciones (opcional)
BACKUP_NOTIFICATION_EMAIL=admin@example.com
BACKUP_NOTIFICATION_SLACK_WEBHOOK=https://hooks.slack.com/...

# Storage externo (opcional)
BACKUP_S3_BUCKET=aurore-events-backups
BACKUP_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

---

### 3.6 Integración con S3 (Opcional)

```typescript
// src/modules/backup/services/s3-backup.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { S3 } from 'aws-sdk';

@Injectable()
export class S3BackupService {
  private readonly logger = new Logger(S3BackupService.name);
  private readonly s3: S3;
  private readonly bucket: string;

  constructor() {
    this.s3 = new S3({
      region: process.env.BACKUP_S3_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
    this.bucket = process.env.BACKUP_S3_BUCKET || 'aurore-events-backups';
  }

  async uploadBackup(localFile: string): Promise<string> {
    const key = `backups/${new Date().toISOString().split('T')[0]}/${path.basename(localFile)}`;

    try {
      const fileContent = await fs.readFile(localFile);
      
      await this.s3.upload({
        Bucket: this.bucket,
        Key: key,
        Body: fileContent,
        ContentType: 'application/gzip',
      }).promise();

      this.logger.log(`Backup uploaded to S3: s3://${this.bucket}/${key}`);
      return key;
    } catch (error) {
      this.logger.error(`Failed to upload backup to S3: ${error.message}`);
      throw error;
    }
  }

  async downloadBackup(s3Key: string, localFile: string): Promise<void> {
    try {
      const data = await this.s3.getObject({
        Bucket: this.bucket,
        Key: s3Key,
      }).promise();

      await fs.writeFile(localFile, data.Body as Buffer);
      this.logger.log(`Backup downloaded from S3: ${localFile}`);
    } catch (error) {
      this.logger.error(`Failed to download backup from S3: ${error.message}`);
      throw error;
    }
  }

  async listBackups(): Promise<string[]> {
    try {
      const result = await this.s3.listObjectsV2({
        Bucket: this.bucket,
        Prefix: 'backups/',
      }).promise();

      return result.Contents?.map(obj => obj.Key || '') || [];
    } catch (error) {
      this.logger.error(`Failed to list backups from S3: ${error.message}`);
      return [];
    }
  }
}
```

---

### 3.7 Checklist de Implementación

- [ ] Crear script de backup local (`backup-database.sh`)
- [ ] Crear script de backup para Docker (`backup-database-docker.sh`)
- [ ] Crear script de restauración (`restore-database.sh`)
- [ ] Crear servicio de backup en NestJS (`BackupService`)
- [ ] Configurar cron job para backups automáticos
- [ ] Crear controlador de backup (opcional, para administración)
- [ ] Integrar backup con migraciones
- [ ] Configurar retención de backups
- [ ] Configurar variables de entorno
- [ ] Probar script de backup
- [ ] Probar script de restauración
- [ ] Documentar proceso de backup
- [ ] Documentar proceso de restauración
- [ ] Crear plan de disaster recovery
- [ ] Configurar notificaciones de backup (email/Slack)
- [ ] Integrar con S3/almacenamiento externo (opcional)
- [ ] Testear restauración periódicamente (mensual)

---

### 3.8 Plan de Disaster Recovery

```markdown
# Plan de Disaster Recovery

## RPO (Recovery Point Objective)
- **Objetivo**: Máximo 24 horas de pérdida de datos
- **Backups**: Diarios a las 2 AM
- **Pérdida máxima**: Eventos desde último backup (máximo 24 horas)

## RTO (Recovery Time Objective)
- **Objetivo**: Restaurar servicio en máximo 4 horas
- **Proceso**:
  1. Identificar problema (15 min)
  2. Seleccionar backup apropiado (15 min)
  3. Restaurar base de datos (30 min - 2 horas dependiendo del tamaño)
  4. Verificar integridad (30 min)
  5. Reiniciar aplicación (15 min)
  6. Verificar funcionamiento (30 min)

## Escenarios de Recuperación

### Escenario 1: Corrupción de Base de Datos
1. Detener aplicación
2. Restaurar último backup
3. Verificar integridad
4. Reiniciar aplicación

### Escenario 2: Eliminación Accidentales de Datos
1. Identificar timestamp del error
2. Restaurar backup anterior al error
3. Verificar datos restaurados
4. Reiniciar aplicación

### Escenario 3: Pérdida Completa del Servidor
1. Provisionar nuevo servidor
2. Configurar PostgreSQL
3. Restaurar backup más reciente
4. Configurar aplicación
5. Verificar funcionamiento

## Contactos de Emergencia
- DBA: dba@example.com
- DevOps: devops@example.com
- On-Call: +1-XXX-XXX-XXXX
```

---

### 3.9 Consideraciones Adicionales

#### Seguridad
- **Encriptar backups**: Usar GPG o almacenamiento encriptado
- **Control de acceso**: Limitar acceso a backups solo a personal autorizado
- **Rotación de credenciales**: Cambiar credenciales de S3/almacenamiento periódicamente

#### Performance
- **Backups incrementales**: Para bases de datos grandes, considerar backups incrementales
- **Compresión**: Siempre comprimir backups para ahorrar espacio
- **Backups fuera de horas pico**: Ejecutar durante ventana de bajo tráfico

#### Monitoreo
- **Alertar fallos de backup**: Notificar inmediatamente si un backup falla
- **Verificar integridad**: Validar backups periódicamente (restaurar en ambiente de test)
- **Tracking de tamaño**: Monitorear crecimiento de tamaño de backups

---

## 📊 Resumen de Mejoras Críticas

### Tiempo Estimado de Implementación

1. **Autenticación con API Keys**: 2-3 días
   - Desarrollo: 1-2 días
   - Tests: 0.5 día
   - Documentación: 0.5 día

2. **Migraciones de TypeORM**: 1-2 días
   - Configuración: 0.5 día
   - Migración inicial: 0.5 día
   - Tests: 0.5 día
   - Documentación: 0.5 día

3. **Backup y Recuperación**: 1-2 días
   - Scripts: 0.5 día
   - Servicio NestJS: 0.5 día
   - Tests: 0.5 día
   - Documentación: 0.5 día

**Total**: 4-7 días de desarrollo

### Prioridad de Implementación

1. **Día 1-2**: Migraciones de TypeORM (bloquea otras mejoras)
2. **Día 2-4**: Autenticación con API Keys
3. **Día 4-5**: Backup y Recuperación

### Orden Sugerido

1. ✅ Primero: **Migraciones** (desbloquea cambios en BD)
2. ✅ Segundo: **Backup** (protege antes de cambios)
3. ✅ Tercero: **Autenticación** (seguridad, requiere BD estable)

---

**Fecha de Análisis:** 2024-01-15  
**Versión del Documento:** 1.0.0  
**Autor:** AI Assistant

