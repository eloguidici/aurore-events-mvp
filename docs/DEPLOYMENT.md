# 🚀 Guía de Deployment - Aurore Events MVP

Esta guía proporciona instrucciones completas para desplegar **aurore-events-mvp** en un ambiente de producción.

---

## 📋 Tabla de Contenidos

1. [Requisitos Previos](#1-requisitos-previos)
2. [Preparación del Entorno](#2-preparación-del-entorno)
3. [Configuración de Base de Datos](#3-configuración-de-base-de-datos)
4. [Configuración de Variables de Entorno](#4-configuración-de-variables-de-entorno)
5. [Build de la Aplicación](#5-build-de-la-aplicación)
6. [Deployment con Docker](#6-deployment-con-docker)
7. [Deployment sin Docker](#7-deployment-sin-docker)
8. [Migraciones de Base de Datos](#8-migraciones-de-base-de-datos)
9. [Verificación Post-Deployment](#9-verificación-post-deployment)
10. [Monitoreo y Alertas](#10-monitoreo-y-alertas)
11. [Procedimientos de Rollback](#11-procedimientos-de-rollback)
12. [Plan de Disaster Recovery](#12-plan-de-disaster-recovery)

---

## 1. Requisitos Previos

### Infraestructura

- **Servidor**: Linux (Ubuntu 20.04+ o similar) o contenedor Docker
- **Node.js**: Versión 18.x o superior
- **PostgreSQL**: Versión 16 o superior
- **Memoria**: Mínimo 2GB RAM (recomendado 4GB+)
- **Disco**: Mínimo 20GB de espacio libre (para logs, backups, base de datos)

### Herramientas

- **npm** o **yarn** (gestor de paquetes)
- **Docker** y **Docker Compose** (si se usa deployment con contenedores)
- **Git** (para clonar el repositorio)
- **PostgreSQL client** (psql) para administración de base de datos

### Permisos

- Acceso SSH al servidor de producción
- Acceso a base de datos PostgreSQL
- Permisos para crear directorios y archivos
- Permisos para configurar servicios del sistema (si se usa systemd)

---

## 2. Preparación del Entorno

### 2.1 Clonar Repositorio

```bash
# Clonar el repositorio
git clone <repository-url> aurore-events-mvp
cd aurore-events-mvp

# Verificar que estás en la rama correcta (main, production, etc.)
git checkout main
git pull origin main

# Verificar que no hay cambios sin commitear
git status
```

### 2.2 Instalar Dependencias

```bash
# Instalar dependencias de producción
npm ci --production=false

# Verificar que todas las dependencias se instalaron correctamente
npm audit --audit-level=moderate
```

### 2.3 Crear Usuario del Sistema (Opcional)

```bash
# Crear usuario dedicado para la aplicación
sudo useradd -m -s /bin/bash aurore
sudo mkdir -p /opt/aurore-events
sudo chown aurore:aurore /opt/aurore-events
```

---

## 3. Configuración de Base de Datos

### 3.1 Instalar PostgreSQL

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install postgresql-16 postgresql-contrib

# Verificar instalación
psql --version
```

### 3.2 Configurar PostgreSQL

```bash
# Acceder a PostgreSQL como usuario postgres
sudo -u postgres psql

# Crear base de datos y usuario
CREATE DATABASE aurore_events;
CREATE USER aurore_user WITH PASSWORD 'SECURE_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE aurore_events TO aurore_user;

# Configurar extensiones necesarias
\c aurore_events
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

# Salir
\q
```

### 3.3 Configurar Conexión Remota (Opcional)

Si PostgreSQL está en un servidor separado, configurar `pg_hba.conf` y `postgresql.conf`:

```bash
# /etc/postgresql/16/main/postgresql.conf
listen_addresses = '*'  # O IP específica del servidor de app

# /etc/postgresql/16/main/pg_hba.conf
host    aurore_events    aurore_user    <app-server-ip>/32    md5

# Reiniciar PostgreSQL
sudo systemctl restart postgresql
```

---

## 4. Configuración de Variables de Entorno

### 4.1 Crear Archivo .env

```bash
# Crear archivo .env en el directorio raíz
cp env.example .env
nano .env  # O usar tu editor preferido
```

### 4.2 Configurar Variables de Producción

```env
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0  # Escuchar en todas las interfaces

# Database Configuration (REQUIRED)
DB_HOST=<postgres-host>  # localhost si está en el mismo servidor
DB_PORT=5432
DB_USERNAME=aurore_user
DB_PASSWORD=<SECURE_PASSWORD>
DB_DATABASE=aurore_events
DB_SYNCHRONIZE=false  # ⚠️ IMPORTANTE: false en producción
DB_LOGGING=false  # true para debugging, false en producción
DB_POOL_MAX=20

# Batch Worker Configuration
BATCH_SIZE=5000
DRAIN_INTERVAL=1000
MAX_RETRIES=3
BATCH_MAX_SIZE=10000

# Buffer Configuration
BUFFER_MAX_SIZE=50000
CHECKPOINT_INTERVAL_MS=5000

# Retention Configuration
RETENTION_DAYS=30
RETENTION_CRON_SCHEDULE=0 2 * * *  # Diario a las 2 AM UTC

# Query Configuration
DEFAULT_QUERY_LIMIT=100
MAX_QUERY_LIMIT=1000
MAX_QUERY_TIME_RANGE_DAYS=30
QUERY_TIMEOUT_MS=30000
MAX_QUERY_PAGE=10000

# Service Configuration
SERVICE_NAME_MAX_LENGTH=100
RETRY_AFTER_SECONDS=5

# Validation Configuration
MESSAGE_MAX_LENGTH=2000
METADATA_MAX_SIZE_KB=16
BATCH_CHUNK_SIZE=1000
METADATA_MAX_KEYS=100
METADATA_MAX_DEPTH=5

# Rate Limiting Configuration
THROTTLE_TTL_MS=60000
THROTTLE_GLOBAL_LIMIT=300000
THROTTLE_IP_LIMIT=10000
THROTTLE_QUERY_LIMIT=200
THROTTLE_HEALTH_LIMIT=60

# Circuit Breaker Configuration
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=2
CIRCUIT_BREAKER_TIMEOUT_MS=30000

# Shutdown Configuration
SHUTDOWN_TIMEOUT_MS=30000

# Metrics Configuration
METRICS_HISTORY_DEFAULT_LIMIT=100

# Compression Configuration (Nuevo)
ENABLE_METADATA_COMPRESSION=true  # Habilitar compresión de metadata
COMPRESSION_THRESHOLD_BYTES=1024  # Comprimir si > 1KB

# Backup Configuration (Nuevo)
BACKUP_DIR=/var/backups/aurore-events
BACKUP_RETENTION_DAYS=7
BACKUP_CRON_SCHEDULE=0 2 * * *  # Diario a las 2 AM UTC
```

### 4.3 Proteger Archivo .env

```bash
# Establecer permisos restrictivos en .env
chmod 600 .env
chown aurore:aurore .env

# Verificar que .env no está en git (debería estar en .gitignore)
git check-ignore .env
```

---

## 5. Build de la Aplicación

### 5.1 Compilar TypeScript

```bash
# Compilar proyecto a JavaScript
npm run build

# Verificar que se creó el directorio dist/
ls -la dist/

# Verificar que main.js existe
ls -la dist/main.js
```

### 5.2 Verificar Build

```bash
# Ejecutar linter para verificar código
npm run lint

# Ejecutar tests (opcional, puede omitirse en producción)
npm run test

# Verificar tamaño del build
du -sh dist/
```

---

## 6. Deployment con Docker

### 6.1 Crear Dockerfile

```dockerfile
# Dockerfile (ya debería existir, pero revisar)
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY src ./src

# Build
RUN npm run build

# Stage de producción
FROM node:18-alpine

WORKDIR /app

# Instalar solo dependencias de producción
COPY package*.json ./
RUN npm ci --only=production

# Copiar build desde builder
COPY --from=builder /app/dist ./dist

# Crear usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S aurore -u 1001
USER aurore

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicio
CMD ["node", "dist/main"]
```

### 6.2 Crear docker-compose.prod.yml

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: aurore-events-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # Variables de entorno desde .env
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_USERNAME=${DB_USERNAME}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_DATABASE=${DB_DATABASE}
      - DB_SYNCHRONIZE=false
      # ... otras variables
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - aurore-network
    volumes:
      - ./checkpoints:/app/checkpoints
      - ./logs:/app/logs
      - ./backups:/app/backups
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    image: postgres:16-alpine
    container_name: aurore-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USERNAME}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_DATABASE}
      PGDATA: /var/lib/postgresql/data/pgdata
      TZ: UTC
      PGTZ: UTC
    ports:
      - "5432:5432"  # Solo si necesita acceso externo
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USERNAME} -d ${DB_DATABASE}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - aurore-network

  prometheus:
    image: prom/prometheus:latest
    container_name: aurore-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    networks:
      - aurore-network
    depends_on:
      - app

  grafana:
    image: grafana/grafana:latest
    container_name: aurore-grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_USER:-admin}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-CHANGE_ME}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SERVER_ROOT_URL=${GRAFANA_URL:-http://localhost:3001}
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/var/lib/grafana/dashboards
    networks:
      - aurore-network
    depends_on:
      - prometheus

networks:
  aurore-network:
    driver: bridge

volumes:
  postgres_data:
    driver: local
  prometheus_data:
    driver: local
  grafana_data:
    driver: local
```

### 6.3 Deploy con Docker Compose

```bash
# Build de imágenes
docker-compose -f docker-compose.prod.yml build

# Verificar configuración
docker-compose -f docker-compose.prod.yml config

# Iniciar servicios
docker-compose -f docker-compose.prod.yml up -d

# Ver logs
docker-compose -f docker-compose.prod.yml logs -f app

# Verificar estado
docker-compose -f docker-compose.prod.yml ps

# Verificar health checks
curl http://localhost:3000/health
```

---

## 7. Deployment sin Docker

### 7.1 Usando PM2 (Recomendado)

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Crear archivo de configuración PM2
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'aurore-events',
    script: './dist/main.js',
    instances: 1,  // O 'max' para usar todos los CPUs
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G',
    watch: false,
  }],
};
EOF

# Iniciar aplicación con PM2
pm2 start ecosystem.config.js

# Configurar PM2 para iniciar en boot
pm2 startup
pm2 save

# Verificar estado
pm2 status
pm2 logs aurore-events
```

### 7.2 Usando systemd

```bash
# Crear servicio systemd
sudo cat > /etc/systemd/system/aurore-events.service << EOF
[Unit]
Description=Aurore Events MVP Application
After=network.target postgresql.service

[Service]
Type=simple
User=aurore
WorkingDirectory=/opt/aurore-events
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=aurore-events
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Recargar systemd
sudo systemctl daemon-reload

# Habilitar servicio para iniciar en boot
sudo systemctl enable aurore-events

# Iniciar servicio
sudo systemctl start aurore-events

# Verificar estado
sudo systemctl status aurore-events

# Ver logs
sudo journalctl -u aurore-events -f
```

---

## 8. Migraciones de Base de Datos

### 8.1 Crear Backup Antes de Migraciones

```bash
# ⚠️ IMPORTANTE: Siempre hacer backup antes de ejecutar migraciones
npm run db:backup

# Verificar que el backup se creó
ls -lh backups/
```

### 8.2 Ejecutar Migraciones

```bash
# Ver migraciones pendientes (sin ejecutarlas)
npm run migration:show

# Ejecutar migraciones
npm run migration:run

# Verificar que las migraciones se ejecutaron
psql -h $DB_HOST -U $DB_USERNAME -d $DB_DATABASE -c "SELECT * FROM migrations;"
```

### 8.3 Rollback de Migraciones (Si es Necesario)

```bash
# Revertir última migración
npm run migration:revert

# Restaurar backup si es necesario
npm run db:restore backups/aurore_events_YYYYMMDD_HHMMSS.sql.gz
```

---

## 9. Verificación Post-Deployment

### 9.1 Verificar Salud de la Aplicación

```bash
# Health check básico
curl http://localhost:3000/health

# Health check detallado
curl http://localhost:3000/health/detailed

# Verificar base de datos
curl http://localhost:3000/health/database

# Verificar buffer
curl http://localhost:3000/health/buffer

# Verificar métricas de negocio
curl http://localhost:3000/health/business
```

### 9.2 Probar Endpoints Principales

```bash
# Probar ingesta de eventos
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2024-01-15T10:30:00.000Z",
    "service": "test-service",
    "message": "Test event",
    "metadata": {}
  }'

# Probar consulta de eventos
curl "http://localhost:3000/events?service=test-service&from=2024-01-15T00:00:00.000Z&to=2024-01-15T23:59:59.000Z&page=1&pageSize=10"

# Verificar métricas Prometheus
curl http://localhost:3000/metrics/prometheus
```

### 9.3 Verificar Logs

```bash
# Ver logs de la aplicación
tail -f logs/app.log

# Ver logs de PM2
pm2 logs aurore-events

# Ver logs de systemd
sudo journalctl -u aurore-events -f

# Ver logs de Docker
docker-compose -f docker-compose.prod.yml logs -f app
```

### 9.4 Verificar Recursos del Sistema

```bash
# Verificar uso de memoria
free -h

# Verificar uso de CPU
top -p $(pgrep -f "node dist/main")

# Verificar espacio en disco
df -h

# Verificar conexiones a base de datos
psql -h $DB_HOST -U $DB_USERNAME -d $DB_DATABASE -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'aurore_events';"
```

---

## 10. Monitoreo y Alertas

### 10.1 Configurar Prometheus (Ya Incluido)

```yaml
# prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'aurore-events'
    static_configs:
      - targets: ['app:3000']  # O 'localhost:3000' si no usa Docker
    metrics_path: '/metrics/prometheus'
```

### 10.2 Configurar Alertas en Prometheus

```yaml
# prometheus/alert.rules.yml
groups:
  - name: aurore_events_alerts
    rules:
      - alert: BufferFull
        expr: buffer_utilization_percent > 90
        for: 5m
        annotations:
          summary: "Buffer utilization is above 90%"
          description: "Buffer is {{ $value }}% full"

      - alert: DatabaseDown
        expr: database_connection_status == 0
        for: 1m
        annotations:
          summary: "Database connection failed"
          description: "Database health check is failing"

      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state == 1  # 1 = OPEN
        for: 2m
        annotations:
          summary: "Circuit breaker is OPEN"
          description: "Circuit breaker has opened, database operations are being rejected"

      - alert: HighErrorRate
        expr: rate(events_dropped_total[5m]) > 100
        for: 5m
        annotations:
          summary: "High event drop rate"
          description: "Events are being dropped at {{ $value }} events/second"

      - alert: MemoryHigh
        expr: (nodejs_heap_size_total_bytes / 1024 / 1024) > 1024  # > 1GB
        for: 5m
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}MB"
```

### 10.3 Configurar Grafana (Ya Incluido)

Grafana se configura automáticamente con el dashboard provisto:
- Dashboard: `grafana/dashboards/aurore-dashboard.json`
- Datasource: `grafana/provisioning/datasources/prometheus.yml`

**Acceso:**
- URL: http://localhost:3001 (o tu dominio)
- Usuario: `admin` (configurar password en primer acceso)
- Dashboard: "Aurore Events - Complete Dashboard"

### 10.4 Alertas por Email/Slack (Opcional)

```typescript
// Configurar notificaciones en Prometheus AlertManager
# alertmanager/alertmanager.yml
route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'slack-notifications'
  routes:
    - match:
        severity: critical
      receiver: 'email-critical'

receivers:
  - name: 'slack-notifications'
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK_URL'
        channel: '#alerts'
        title: 'Aurore Events Alert'
        text: '{{ .CommonAnnotations.description }}'

  - name: 'email-critical'
    email_configs:
      - to: 'admin@example.com'
        from: 'alerts@aurore-events.com'
        smarthost: 'smtp.example.com:587'
        auth_username: 'alerts@example.com'
        auth_password: 'SMTP_PASSWORD'
```

---

## 11. Procedimientos de Rollback

### 11.1 Rollback de Código

```bash
# Identificar versión anterior
git log --oneline

# Rollback a versión anterior
git checkout <commit-hash>
npm run build

# Reiniciar aplicación
pm2 restart aurore-events
# O
sudo systemctl restart aurore-events
# O
docker-compose -f docker-compose.prod.yml restart app
```

### 11.2 Rollback de Base de Datos

```bash
# Revertir migraciones
npm run migration:revert

# O restaurar desde backup
npm run db:restore backups/aurore_events_YYYYMMDD_HHMMSS.sql.gz
```

### 11.3 Rollback Completo

```bash
# 1. Detener aplicación
pm2 stop aurore-events
# O
sudo systemctl stop aurore-events
# O
docker-compose -f docker-compose.prod.yml stop app

# 2. Restaurar backup de base de datos
npm run db:restore backups/aurore_events_YYYYMMDD_HHMMSS.sql.gz

# 3. Rollback de código
git checkout <previous-version>
npm run build

# 4. Reiniciar aplicación
pm2 restart aurore-events
# O
sudo systemctl start aurore-events
# O
docker-compose -f docker-compose.prod.yml start app

# 5. Verificar que funciona
curl http://localhost:3000/health
```

---

## 12. Plan de Disaster Recovery

### 12.1 Escenarios de Recuperación

#### Escenario 1: Pérdida de Base de Datos

```bash
# 1. Detener aplicación
sudo systemctl stop aurore-events

# 2. Restaurar base de datos desde backup más reciente
pg_restore -h localhost -U aurore_user -d aurore_events backups/aurore_events_latest.sql.gz

# 3. Verificar integridad
psql -h localhost -U aurore_user -d aurore_events -c "SELECT count(*) FROM event;"

# 4. Reiniciar aplicación
sudo systemctl start aurore-events
```

#### Escenario 2: Pérdida Completa del Servidor

```bash
# En nuevo servidor:

# 1. Instalar PostgreSQL y Node.js
sudo apt-get install postgresql-16 nodejs npm

# 2. Restaurar base de datos
pg_restore -h localhost -U postgres -d aurore_events backup_from_s3.sql.gz

# 3. Clonar repositorio
git clone <repository-url> aurore-events-mvp
cd aurore-events-mvp

# 4. Configurar .env
cp env.example .env
# Editar .env con credenciales de producción

# 5. Build y deploy
npm ci
npm run build
npm run migration:run  # Si hay nuevas migraciones
pm2 start ecosystem.config.js
```

### 12.2 RPO y RTO

- **RPO (Recovery Point Objective)**: 24 horas (backups diarios)
- **RTO (Recovery Time Objective)**: 4 horas (tiempo máximo para restaurar servicio)

### 12.3 Checklist de Recuperación

- [ ] Identificar problema
- [ ] Detener aplicación si es necesario
- [ ] Restaurar base de datos desde backup más reciente
- [ ] Verificar integridad de datos
- [ ] Ejecutar migraciones si es necesario
- [ ] Reiniciar aplicación
- [ ] Verificar health checks
- [ ] Verificar funcionalidad básica (ingesta y consulta)
- [ ] Monitorear logs por errores
- [ ] Notificar a stakeholders sobre recuperación

---

## 📝 Checklist de Deployment

### Pre-Deployment

- [ ] Todas las pruebas pasan (`npm test`)
- [ ] Linter sin errores (`npm run lint`)
- [ ] Build exitoso (`npm run build`)
- [ ] Variables de entorno configuradas
- [ ] Backup de base de datos existente
- [ ] Documentación actualizada

### Deployment

- [ ] Backup de base de datos creado
- [ ] Migraciones ejecutadas (si hay nuevas)
- [ ] Aplicación desplegada
- [ ] Servicios iniciados correctamente
- [ ] Health checks pasando
- [ ] Endpoints funcionando correctamente

### Post-Deployment

- [ ] Monitoreo configurado
- [ ] Alertas configuradas
- [ ] Logs verificados
- [ ] Métricas verificadas
- [ ] Performance verificada
- [ ] Documentación de deployment actualizada

---

## 🔧 Troubleshooting

### Problema: Aplicación no inicia

```bash
# Verificar logs
pm2 logs aurore-events
# O
sudo journalctl -u aurore-events -n 100

# Verificar variables de entorno
cat .env

# Verificar que el puerto está disponible
netstat -tuln | grep 3000

# Verificar permisos
ls -la dist/main.js
```

### Problema: Error de conexión a base de datos

```bash
# Verificar que PostgreSQL está corriendo
sudo systemctl status postgresql

# Probar conexión manual
psql -h $DB_HOST -U $DB_USERNAME -d $DB_DATABASE -c "SELECT 1;"

# Verificar credenciales en .env
grep DB_ .env

# Verificar firewall
sudo ufw status
```

### Problema: Migraciones fallan

```bash
# Ver estado de migraciones
psql -h $DB_HOST -U $DB_USERNAME -d $DB_DATABASE -c "SELECT * FROM migrations;"

# Verificar logs de migración
npm run migration:show

# Revertir migración problemática
npm run migration:revert

# Restaurar desde backup
npm run db:restore backups/latest_backup.sql.gz
```

---

**Fecha de Actualización:** 2024-01-15  
**Versión del Documento:** 1.0.0
