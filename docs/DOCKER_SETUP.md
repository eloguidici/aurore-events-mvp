# 🐳 Configuración de PostgreSQL con Docker Compose

## 📋 Requisitos Previos

- Docker instalado y funcionando
- Docker Compose instalado (incluido en Docker Desktop)

## 🚀 Inicio Rápido

### 1. Levantar PostgreSQL

```bash
docker-compose up -d
```

Esto iniciará PostgreSQL en segundo plano con la siguiente configuración:
- **Usuario**: `admin`
- **Password**: `admin`
- **Base de datos**: `aurore_events`
- **Puerto**: `5432`

### 2. Verificar que PostgreSQL está corriendo

```bash
docker-compose ps
```

Deberías ver el contenedor `aurore-postgres` con estado `Up`.

### 3. Verificar conexión a la base de datos

```bash
docker-compose exec postgres psql -U admin -d aurore_events
```

O desde fuera del contenedor:

```bash
psql -h localhost -p 5432 -U admin -d aurore_events
```

Password: `admin`

### 4. Configurar variables de entorno

Crea un archivo `.env` basado en `env.example`:

```bash
cp env.example .env
```

Asegúrate de tener estas variables configuradas:

```env
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=admin
DB_PASSWORD=admin
DB_DATABASE=aurore_events
DB_SYNCHRONIZE=true
DB_LOGGING=false
BATCH_CHUNK_SIZE=1000
```

### 5. Instalar dependencias de PostgreSQL

```bash
npm install pg
npm install --save-dev @types/pg
```

### 6. Iniciar la aplicación

```bash
npm run start:dev
```

La aplicación se conectará automáticamente a PostgreSQL y creará las tablas necesarias si `DB_SYNCHRONIZE=true`.

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

### Detener y eliminar volúmenes (⚠️ Esto borra los datos)

```bash
docker-compose down -v
```

### Reiniciar PostgreSQL

```bash
docker-compose restart postgres
```

### Acceder a la consola de PostgreSQL

```bash
docker-compose exec postgres psql -U admin -d aurore_events
```

### Ejecutar comandos SQL directamente

```bash
docker-compose exec postgres psql -U admin -d aurore_events -c "SELECT COUNT(*) FROM events;"
```

## 📊 Verificar Datos

### Listar tablas

```bash
docker-compose exec postgres psql -U admin -d aurore_events -c "\dt"
```

### Ver estructura de la tabla events

```bash
docker-compose exec postgres psql -U admin -d aurore_events -c "\d events"
```

### Contar eventos

```bash
docker-compose exec postgres psql -U admin -d aurore_events -c "SELECT COUNT(*) FROM events;"
```

## 🔧 Configuración Avanzada

### Cambiar credenciales

Edita `docker-compose.yml` y cambia las variables de entorno:

```yaml
environment:
  POSTGRES_USER: tu_usuario
  POSTGRES_PASSWORD: tu_password
  POSTGRES_DB: tu_database
```

Luego actualiza tu archivo `.env` con las mismas credenciales.

### Cambiar puerto

Si el puerto 5432 está ocupado, cambia el mapeo en `docker-compose.yml`:

```yaml
ports:
  - "5433:5432"  # Puerto externo:puerto interno
```

Y actualiza `DB_PORT=5433` en tu `.env`.

### Persistencia de Datos

Los datos se guardan en un volumen de Docker llamado `postgres_data`. Esto significa que los datos persisten incluso si detienes el contenedor.

Para hacer backup:

```bash
docker-compose exec postgres pg_dump -U admin aurore_events > backup.sql
```

Para restaurar:

```bash
docker-compose exec -T postgres psql -U admin aurore_events < backup.sql
```

## 🐛 Solución de Problemas

### Error: "port is already allocated"

El puerto 5432 ya está en uso. Cambia el puerto en `docker-compose.yml` o detén el servicio que está usando ese puerto.

### Error: "connection refused"

1. Verifica que PostgreSQL esté corriendo: `docker-compose ps`
2. Verifica los logs: `docker-compose logs postgres`
3. Verifica que el healthcheck haya pasado: espera unos segundos después de iniciar

### Error: "database does not exist"

La base de datos se crea automáticamente al iniciar el contenedor. Si no existe, reinicia el contenedor:

```bash
docker-compose down
docker-compose up -d
```

### Error: "password authentication failed"

Verifica que las credenciales en `.env` coincidan con las de `docker-compose.yml`.

## 📝 Notas

- **Desarrollo**: Usa `DB_SYNCHRONIZE=true` para que TypeORM cree/modifique las tablas automáticamente
- **Producción**: Usa `DB_SYNCHRONIZE=false` y migrations de TypeORM
- Los datos persisten en el volumen `postgres_data` incluso si detienes el contenedor
- Para desarrollo local rápido, puedes seguir usando SQLite cambiando `DB_TYPE=sqlite` en tu `.env`

## 🔄 Migración desde SQLite

Si tienes datos en SQLite y quieres migrarlos a PostgreSQL:

1. Exporta datos de SQLite (usando una herramienta como `sqlite3`)
2. Importa a PostgreSQL usando `psql` o herramientas de migración

O simplemente deja que la aplicación empiece desde cero con PostgreSQL.

