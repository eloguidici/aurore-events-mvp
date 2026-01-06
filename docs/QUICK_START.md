# 🚀 Inicio Rápido - PostgreSQL

## ⚡ 2 Comandos para Empezar

### Opción 1: Todo en uno (Recomendado)
```bash
npm run dev
```
Este comando levanta PostgreSQL y la aplicación automáticamente.

### Opción 2: Manual (3 pasos)

#### 1️⃣ Levantar PostgreSQL
```bash
docker-compose up -d
```
o
```bash
npm run docker:up
```

#### 2️⃣ Instalar dependencias (solo la primera vez)
```bash
npm install
```

#### 3️⃣ Iniciar aplicación
```bash
npm run start:dev
```

**¡Listo!** La aplicación se conectará automáticamente a PostgreSQL.

---

## ⚠️ Configuración Requerida

**DEBES crear un archivo `.env`** con todas las variables de entorno requeridas:

```bash
cp env.example .env
```

Luego edita `.env` y configura todas las variables. Para PostgreSQL, asegúrate de tener:

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

**Todas las variables son REQUERIDAS** - la aplicación fallará si falta alguna.

---

## 🔧 Si Necesitas Configurar Manualmente

Crea un archivo `.env` basado en `env.example`:

```bash
cp env.example .env
```

Y asegúrate de tener estas líneas:

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

---

## ✅ Verificar que Funciona

### Ver logs de PostgreSQL
```bash
docker-compose logs postgres
```

### Verificar conexión
```bash
docker-compose exec postgres psql -U admin -d aurore_events -c "SELECT version();"
```

### Ver tablas creadas
```bash
docker-compose exec postgres psql -U admin -d aurore_events -c "\dt"
```

---

## 🛑 Detener Todo

```bash
docker-compose down
```

---

## ❓ Problemas Comunes

### Error: "port is already allocated"
Alguien más está usando el puerto 5432. Cambia el puerto en `docker-compose.yml`:
```yaml
ports:
  - "5433:5432"  # Cambia 5432 por 5433
```
Y actualiza `DB_PORT=5433` en tu `.env`.

### Error: "connection refused"
Espera unos segundos después de `docker-compose up -d`. PostgreSQL necesita tiempo para iniciar.

### Error: "database does not exist"
Reinicia el contenedor:
```bash
docker-compose down
docker-compose up -d
```

---

## 📚 Más Información

- Ver `DOCKER_SETUP.md` para detalles avanzados
- Ver `doc/ANALISIS_MIGRACION_POSTGRESQL.md` para análisis técnico

