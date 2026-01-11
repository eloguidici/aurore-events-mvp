# 🧪 Guía de Pruebas - Equipo Aurore

> 📖 **Para documentación técnica detallada** (estrategia, cobertura, mejores prácticas), ver [`TESTING.md`](./TESTING.md)
> 
> Esta guía se enfoca en **ejecución práctica paso a paso**.

## 📋 Requisitos Previos

- Node.js instalado (v18 o superior)
- Docker Desktop instalado y corriendo
- Git (para clonar el repositorio)

---

## 🚀 Setup Inicial (Solo Primera Vez)

### Paso 1: Clonar el repositorio
```bash
git clone <url-del-repositorio>
cd aurore-events-mvp
```

### Paso 2: Instalar dependencias
```bash
npm install
```

### Paso 3: Crear archivo de configuración
```bash
# Windows PowerShell
Copy-Item env.example .env

# Linux/Mac
cp env.example .env
```

### Paso 4: Levantar PostgreSQL con Docker
```bash
docker-compose up -d
```

Verificar que PostgreSQL está corriendo:
```bash
docker-compose ps
```

Deberías ver `aurore-postgres` con estado `Up (healthy)`

---

## ✅ Verificar que Todo Funciona

### Paso 1: Iniciar la aplicación
```bash
npm run start:dev
```

Espera a ver este mensaje:
```
🚀 Event System MVP running on http://localhost:3000
✅ Server is ready to receive traffic
```

### Paso 2: Probar endpoint de salud
```bash
# Windows PowerShell
Invoke-WebRequest -Uri http://localhost:3000/health -UseBasicParsing

# Linux/Mac
curl http://localhost:3000/health
```

Deberías recibir: `{"message":"SERVER_IS_READY"}`

---

## 🧪 Pruebas Disponibles

### 1. Prueba Simple (1 evento)

```bash
# Windows PowerShell
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$body = @{
    timestamp = $timestamp
    service = "test-service"
    message = "Evento de prueba"
    metadata = @{
        test = "true"
    }
} | ConvertTo-Json
Invoke-WebRequest -Uri http://localhost:3000/events -Method POST -ContentType "application/json" -Body $body -UseBasicParsing

# Linux/Mac
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "service": "test-service",
    "message": "Evento de prueba",
    "metadata": {"test": "true"}
  }'
```

**Resultado esperado:** `{"statusCode":202,"message":"Event accepted"}`

### 2. Verificar que se guardó en PostgreSQL

```bash
docker-compose exec postgres psql -U admin -d aurore_events -c "SELECT COUNT(*) FROM events WHERE service = 'test-service';"
```

### 3. Consultar eventos

```bash
# Windows PowerShell
$from = (Get-Date).AddHours(-1).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$to = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Invoke-WebRequest -Uri "http://localhost:3000/events?service=test-service&from=$from&to=$to&page=1&pageSize=10" -UseBasicParsing

# Linux/Mac
FROM_DATE=$(date -u -d "1 hour ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-1H +"%Y-%m-%dT%H:%M:%SZ")
TO_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
curl "http://localhost:3000/events?service=test-service&from=${FROM_DATE}&to=${TO_DATE}&page=1&pageSize=10"
```

---

## 📊 Load Tests

### Test Básico (5,000 eventos/minuto)

```bash
npm run load-test 5000 60
```

Esto enviará 5,000 eventos por minuto durante 60 segundos.

### Test de Carga Alta (20,000 eventos/minuto)

```bash
npm run load-test 20000 60
```

### Test Paralelo (Múltiples clientes - hasta 5,000 eventos/segundo)

```bash
# 15 clientes, cada uno enviando 20,000 eventos/minuto
# Total: 300,000 eventos/minuto = 5,000 eventos/segundo
npm run load-test:parallel 15 20000 60
```

**Nota:** Este test puede tomar varios minutos y requiere esperar tiempo adicional para que el worker procese todos los eventos.

---

## 🔍 Verificar Resultados de los Tests

### Ver total de eventos guardados
```bash
docker-compose exec postgres psql -U admin -d aurore_events -c "SELECT COUNT(*) FROM events;"
```

### Ver eventos por servicio
```bash
docker-compose exec postgres psql -U admin -d aurore_events -c "SELECT service, COUNT(*) FROM events GROUP BY service ORDER BY COUNT(*) DESC LIMIT 10;"
```

### Ver estado del buffer
```bash
# Windows PowerShell
Invoke-WebRequest -Uri http://localhost:3000/health/buffer -UseBasicParsing | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 5

# Linux/Mac
curl http://localhost:3000/health/buffer | jq
```

### Ver estado completo del sistema
```bash
# Windows PowerShell
Invoke-WebRequest -Uri http://localhost:3000/health/detailed -UseBasicParsing | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

# Linux/Mac
curl http://localhost:3000/health/detailed | jq
```

---

## 🛠️ Comandos Útiles

### Ver logs de PostgreSQL
```bash
docker-compose logs postgres
```

### Ver logs en tiempo real
```bash
docker-compose logs -f postgres
```

### Detener PostgreSQL
```bash
docker-compose down
```

### Reiniciar PostgreSQL
```bash
docker-compose restart postgres
```

### Acceder a la consola de PostgreSQL
```bash
docker-compose exec postgres psql -U admin -d aurore_events
```

Dentro de psql puedes ejecutar:
```sql
-- Ver todas las tablas
\dt

-- Ver estructura de la tabla events
\d events

-- Contar eventos
SELECT COUNT(*) FROM events;

-- Ver últimos 10 eventos
SELECT id, service, message, timestamp FROM events ORDER BY "createdAt" DESC LIMIT 10;

-- Ver eventos por servicio
SELECT service, COUNT(*) FROM events GROUP BY service ORDER BY COUNT(*) DESC;
```

---

## 📝 Checklist de Pruebas

- [ ] PostgreSQL está corriendo (`docker-compose ps`)
- [ ] La aplicación inicia sin errores (`npm run start:dev`)
- [ ] El endpoint `/health` responde correctamente
- [ ] Puedo enviar un evento (`POST /events`)
- [ ] El evento se guarda en PostgreSQL
- [ ] Puedo consultar eventos (`GET /events`)
- [ ] El load test básico funciona (`npm run load-test 5000 60`)
- [ ] Los eventos se guardan correctamente después del test

---

## ⚠️ Problemas Comunes

### Error: "port is already allocated"
El puerto 5432 está ocupado. Detén el servicio que lo usa o cambia el puerto en `docker-compose.yml`.

### Error: "connection refused"
Espera unos segundos después de `docker-compose up -d`. PostgreSQL necesita tiempo para iniciar.

### Error: "API no disponible"
La aplicación no está corriendo. Ejecuta `npm run start:dev` y espera a que inicie.

### Los eventos no aparecen inmediatamente
Es normal. El worker procesa eventos en batches. Espera 30-60 segundos y verifica nuevamente.

---

## 🎯 Prueba Rápida Completa

```bash
# 1. Levantar PostgreSQL
docker-compose up -d

# 2. Iniciar aplicación (en otra terminal)
npm run start:dev

# 3. Esperar 20 segundos para que inicie

# 4. Ejecutar test básico
npm run load-test 5000 30

# 5. Esperar 60 segundos

# 6. Verificar resultados
docker-compose exec postgres psql -U admin -d aurore_events -c "SELECT COUNT(*) FROM events;"
```

---

## 📚 Documentación Adicional

- `scripts/README.md` - Documentación completa de los scripts de testing
- `scripts/README_PARALLEL.md` - Guía del test paralelo
- `doc/ANALISIS_MIGRACION_POSTGRESQL.md` - Análisis técnico de la migración

---

## ✅ Listo para Probar

Con estos comandos, cualquier persona del equipo puede probar el sistema fácilmente. 🚀

