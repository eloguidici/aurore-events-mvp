# Solución Rápida - Métricas en Cero en Grafana

## Problema
Muchos reportes en Grafana están en cero y no funcionan.

## Soluciones Rápidas

### 1. Verificar que todos los servicios están corriendo

```powershell
# Verificar contenedores Docker
docker ps

# Deberías ver todos estos contenedores corriendo:
# - aurore-postgres
# - aurore-postgres-exporter
# - aurore-prometheus
# - aurore-loki
# - aurore-promtail
# - aurore-grafana
```

Si falta alguno, iniciarlo:
```powershell
docker-compose up -d
```

### 2. Verificar que la aplicación NestJS está corriendo

La aplicación NestJS debe estar corriendo en el puerto 3000 para que Prometheus pueda scrapear las métricas.

```powershell
# Verificar que el puerto 3000 está en uso
Test-NetConnection -ComputerName localhost -Port 3000

# Si no está corriendo, iniciarla:
npm run start:dev
```

### 3. Verificar targets en Prometheus

1. Abrir Prometheus: http://localhost:9090
2. Ir a **Status** > **Targets**
3. Verificar que todos los targets están en estado **UP**:
   - `prometheus` (debe estar UP - siempre está UP)
   - `aurore-events` (debe estar UP si la aplicación está corriendo)
   - `postgres` (debe estar UP)

**Si `aurore-events` está DOWN:**
- Verificar que la aplicación está corriendo
- Verificar que responde en http://localhost:3000/metrics/prometheus
- Verificar logs: `docker logs aurore-prometheus`

**Si `postgres` está DOWN:**
- Verificar que postgres_exporter está corriendo: `docker ps | Select-String postgres-exporter`
- Reiniciar postgres_exporter: `docker restart aurore-postgres-exporter`
- Verificar logs: `docker logs aurore-postgres-exporter`

### 4. Reiniciar postgres_exporter (después de cambios en queries.yaml)

Si has actualizado `postgres-exporter/queries.yaml`, necesitas reiniciar postgres_exporter:

```powershell
docker restart aurore-postgres-exporter
```

Luego esperar unos segundos y verificar que el target en Prometheus está UP.

### 5. Verificar métricas disponibles en Prometheus

1. Abrir Prometheus: http://localhost:9090
2. Ir a **Graph**
3. Buscar métricas:

**Métricas de la aplicación:**
```
buffer_size
buffer_capacity
events_throughput_per_second
business_events_total
```

**Métricas de PostgreSQL:**
```
pg_stat_database_numbackends
pg_stat_statements_calls
pg_stat_statements_mean_exec_time_seconds
pg_stat_statements_max_exec_time_seconds
```

Si alguna métrica no aparece en la lista, significa que no está siendo scrapeada correctamente.

### 6. Reiniciar todos los servicios de monitoreo

Si nada funciona, reiniciar todos los servicios:

```powershell
docker-compose restart prometheus postgres_exporter grafana
```

Luego esperar 1-2 minutos y verificar nuevamente en Grafana.

## Checklist de Verificación

- [ ] Todos los contenedores Docker están corriendo
- [ ] La aplicación NestJS está corriendo en el puerto 3000
- [ ] Prometheus puede acceder a http://localhost:9090
- [ ] Todos los targets en Prometheus están UP
- [ ] Grafana puede acceder a http://localhost:3001
- [ ] Las métricas aparecen en Prometheus (Graph)
- [ ] postgres_exporter fue reiniciado después de cambios en queries.yaml

## Ver Más

Para más detalles y solución de problemas avanzados, ver: [GRAFANA_METRICS_TROUBLESHOOTING.md](./GRAFANA_METRICS_TROUBLESHOOTING.md)
