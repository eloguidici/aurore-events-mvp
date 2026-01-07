# Validación de Configuración - Fail Fast

## ✅ Garantía: La App NO se Levanta si Faltan Variables

**IMPORTANTE**: Si falta alguna variable de entorno requerida, la aplicación **NO se levantará**. La validación ocurre **antes** de que NestJS intente crear cualquier provider o servicio.

---

## 🔍 Cómo Funciona la Validación

### Flujo de Validación

```
1. main.ts inicia
   ↓
2. Importa AppModule
   ↓
3. AppModule importa envs desde './modules/config/envs'
   ↓
4. Node.js ejecuta envs.ts (código de nivel superior)
   ↓
5. Joi valida TODAS las variables requeridas
   ↓
6a. ❌ Si falta alguna → Lanza Error → App NO se levanta
   ↓
6b. ✅ Si todo está bien → Exporta envs → App continúa
   ↓
7. ConfigModule usa envs para crear configuraciones
```

### Código de Validación en `envs.ts`

```typescript
// envs.ts - Líneas 176-224

// Validate environment variables
const { error, value } = envsSchema.validate({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  // ... todas las variables
});

// ⚠️ Si falta alguna variable requerida, esto lanza un Error
if (error) {
  const errorMessage = error.details
    ? error.details.map((detail) => detail.message).join(', ')
    : error.message;
  throw new Error(
    `Config validation error: ${errorMessage}. Please ensure all required environment variables are set in your .env file.`,
  );
}

// ✅ Solo llega aquí si TODAS las variables están presentes y válidas
export const envs = { ... };
```

---

## 🧪 Prueba: Verificar que Falló al Iniciar

### Ejemplo 1: Falta una Variable

```bash
# Remueve CIRCUIT_BREAKER_FAILURE_THRESHOLD del .env
# O simplemente no la definas

# Intenta iniciar la app
npm start

# ❌ ERROR ANTES DE LEVANTARSE:
# Error: Config validation error: "CIRCUIT_BREAKER_FAILURE_THRESHOLD" is required. 
# Please ensure all required environment variables are set in your .env file.
```

### Ejemplo 2: Variable Inválida

```bash
# Define CIRCUIT_BREAKER_FAILURE_THRESHOLD=99999 (fuera de rango)

# Intenta iniciar la app
npm start

# ❌ ERROR:
# Error: Config validation error: "CIRCUIT_BREAKER_FAILURE_THRESHOLD" must be less than or equal to 20
```

---

## ✅ Garantía del ConfigModule

El `ConfigModule` **NO cambia** este comportamiento. La validación sigue ocurriendo porque:

1. `config-factory.ts` importa `envs`
   ```typescript
   import { envs } from './envs'; // ← Aquí se ejecuta la validación
   ```

2. Si `envs` no se puede importar (porque falló la validación), `config-factory.ts` no se puede cargar

3. Si `config-factory.ts` no se puede cargar, `ConfigModule` no se puede inicializar

4. Si `ConfigModule` no se puede inicializar, la app falla al arrancar

---

## 📋 Variables Requeridas

Todas las variables definidas en el schema de Joi con `.required()` son **obligatorias**:

- ✅ `NODE_ENV`
- ✅ `PORT`
- ✅ `HOST`
- ✅ `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- ✅ `DB_SYNCHRONIZE`, `DB_LOGGING`
- ✅ `BATCH_SIZE`, `DRAIN_INTERVAL`, `MAX_RETRIES`
- ✅ `BUFFER_MAX_SIZE`
- ✅ `RETENTION_DAYS`, `RETENTION_CRON_SCHEDULE`
- ✅ `CHECKPOINT_INTERVAL_MS`
- ✅ `DEFAULT_QUERY_LIMIT`, `MAX_QUERY_LIMIT`
- ✅ `SERVICE_NAME_MAX_LENGTH`, `RETRY_AFTER_SECONDS`
- ✅ `MESSAGE_MAX_LENGTH`, `METADATA_MAX_SIZE_KB`, `BATCH_CHUNK_SIZE`
- ✅ `CIRCUIT_BREAKER_FAILURE_THRESHOLD`, `CIRCUIT_BREAKER_SUCCESS_THRESHOLD`, `CIRCUIT_BREAKER_TIMEOUT_MS`
- ✅ `SHUTDOWN_TIMEOUT_MS`
- ✅ `METRICS_HISTORY_DEFAULT_LIMIT`
- ✅ `THROTTLE_TTL_MS`, `THROTTLE_GLOBAL_LIMIT`, `THROTTLE_IP_LIMIT`, `THROTTLE_QUERY_LIMIT`, `THROTTLE_HEALTH_LIMIT`
- ✅ `DB_POOL_MAX`

**Total**: ~30 variables requeridas - todas validadas al inicio.

---

## 🎯 Mensaje de Error Clarificador

Si falta una variable, verás un error como este:

```
Error: Config validation error: "CIRCUIT_BREAKER_FAILURE_THRESHOLD" is required. 
Please ensure all required environment variables are set in your .env file.
```

El mensaje:
- ✅ Indica **qué variable** falta
- ✅ Explica **qué hacer** (configurar en .env)
- ✅ Ocurre **antes** de que la app intente levantarse

---

## 🔒 Seguridad del ConfigModule

### ¿El ConfigModule Puede Bypass la Validación?

**NO**. El `ConfigModule` **no puede** hacer bypass porque:

1. **Depende de `envs`**: Todas las funciones factory importan `envs`
   ```typescript
   import { envs } from './envs'; // ← Validación ya ocurrió aquí
   ```

2. **Validación Ocurre Antes**: La validación sucede al **importar** el módulo, no cuando se llama la función

3. **Fail Fast**: Si `envs` falla al importar, todo lo demás falla también

### Ejemplo de Seguridad

```typescript
// Esto es IMPOSIBLE que funcione sin la variable:
export function createCircuitBreakerConfig(): CircuitBreakerConfig {
  return {
    failureThreshold: envs.circuitBreakerFailureThreshold, // ← Si falta, envs nunca se exportó
    // ...
  };
}
```

Si `CIRCUIT_BREAKER_FAILURE_THRESHOLD` falta:
- ❌ `envs.ts` lanza error al importar
- ❌ `config-factory.ts` no puede importar `envs`
- ❌ `config-factory.ts` falla
- ❌ `ConfigModule` no se puede inicializar
- ❌ App **NO se levanta**

---

## ✅ Conclusión

**La validación está garantizada**:

1. ✅ Ocurre **al inicio** (al importar `envs.ts`)
2. ✅ Es **antes** de que NestJS cree providers
3. ✅ Si falta algo, la app **NO arranca**
4. ✅ El `ConfigModule` **no puede** hacer bypass
5. ✅ El mensaje de error es **claro** y **acciónable**

**No hay riesgo de que la app se levante con configuración incompleta.**

