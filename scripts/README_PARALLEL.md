# 🚀 Load Test Paralelo - Guía de Uso

## 📋 Descripción

Script para ejecutar múltiples clientes de load test en paralelo y alcanzar tasas altas de eventos (hasta 5000 eventos/segundo).

## 🎯 Uso

```bash
npm run load-test:parallel [num_clientes] [eventos_por_minuto_por_cliente] [duracion_segundos]
```

## 📊 Ejemplos

### Ejemplo 1: 5000 eventos/segundo (300,000 eventos/minuto)
```bash
# 15 clientes, cada uno enviando 20,000 eventos/minuto
npm run load-test:parallel 15 20000 60
```

### Ejemplo 2: 3000 eventos/segundo (180,000 eventos/minuto)
```bash
# 10 clientes, cada uno enviando 18,000 eventos/minuto
npm run load-test:parallel 10 18000 60
```

### Ejemplo 3: 2000 eventos/segundo (120,000 eventos/minuto)
```bash
# 8 clientes, cada uno enviando 15,000 eventos/minuto
npm run load-test:parallel 8 15000 60
```

## 🧮 Cálculo de Carga Total

**Fórmula:**
```
Total eventos/segundo = (num_clientes × eventos_por_minuto_por_cliente) / 60
```

**Ejemplos:**
- 15 clientes × 20,000 eventos/min = 300,000 eventos/min = **5,000 eventos/seg**
- 10 clientes × 18,000 eventos/min = 180,000 eventos/min = **3,000 eventos/seg**
- 8 clientes × 15,000 eventos/min = 120,000 eventos/min = **2,000 eventos/seg**

## ⚙️ Parámetros

1. **num_clientes** (requerido): Número de clientes a ejecutar en paralelo
   - Recomendado: 10-20 clientes
   - Máximo práctico: ~30 clientes (depende de tu máquina)

2. **eventos_por_minuto_por_cliente** (requerido): Eventos por minuto que cada cliente enviará
   - Recomendado: 15,000-30,000 eventos/min por cliente
   - Máximo práctico: ~30,000 eventos/min por cliente

3. **duracion_segundos** (opcional, default: 60): Duración del test en segundos

## 📈 Qué Esperar

### Durante la Prueba:
- Múltiples clientes enviando eventos simultáneamente
- El buffer puede llenarse si la carga es muy alta
- Puede haber backpressure (429/503) si el buffer se satura

### Después de la Prueba:
- Espera 60-120 segundos adicionales para que el worker procese todos los eventos
- Verifica los resultados en la base de datos

## 🔍 Verificar Resultados

### Ver total de eventos guardados:
```bash
docker-compose exec postgres psql -U admin -d aurore_events -c "SELECT COUNT(*) FROM events WHERE service LIKE 'parallel-load-test-%';"
```

### Ver eventos por cliente:
```bash
docker-compose exec postgres psql -U admin -d aurore_events -c "SELECT service, COUNT(*) FROM events WHERE service LIKE 'parallel-load-test-%' GROUP BY service ORDER BY COUNT(*) DESC;"
```

### Ver estado del buffer:
```bash
curl http://localhost:3000/health/buffer
```

## ⚠️ Consideraciones

1. **Recursos del Sistema:**
   - Múltiples clientes consumen CPU y memoria
   - Asegúrate de tener recursos suficientes

2. **Límites del Cliente:**
   - Cada cliente puede enviar ~300-400 eventos/segundo máximo
   - Por eso necesitas múltiples clientes para alcanzar 5000 eventos/seg

3. **Procesamiento:**
   - El worker procesa eventos en batches
   - Con carga alta, puede tomar tiempo procesar todos los eventos
   - Espera 60-120 segundos después del test para verificar resultados completos

4. **PostgreSQL:**
   - Asegúrate de que PostgreSQL tenga recursos suficientes
   - Monitorea el uso de CPU y memoria durante el test

## 🎯 Objetivo: 5000 eventos/segundo

Para alcanzar **5000 eventos/segundo** (300,000 eventos/minuto):

```bash
npm run load-test:parallel 15 20000 60
```

Esto ejecutará:
- 15 clientes en paralelo
- Cada cliente: 20,000 eventos/minuto
- Total: 300,000 eventos/minuto = **5,000 eventos/segundo**

## 📝 Notas

- Los clientes se ejecutan en procesos separados
- Cada cliente tiene su propio nombre de servicio único
- Los resultados se pueden verificar individualmente por cliente
- El script espera a que todos los clientes terminen antes de finalizar

