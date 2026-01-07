# Scripts de Testing

Scripts para probar el sistema de eventos bajo diferentes condiciones de carga.

## 🚀 Load Test (Script Principal)

Script unificado para realizar pruebas de carga con configuración simple.

### Uso Básico

```bash
npm run load-test [eventos_por_minuto] [duracion_segundos] [nombre_servicio]
```

### Ejemplos

```bash
# 5000 eventos por minuto durante 60 segundos (default)
npm run load-test 5000

# 10000 eventos por minuto durante 30 segundos
npm run load-test 10000 30

# 20000 eventos por minuto durante 120 segundos con nombre de servicio personalizado
npm run load-test 20000 120 mi-servicio-test
```

### Parámetros

- **eventos_por_minuto** (requerido): Cantidad de eventos a enviar por minuto
- **duracion_segundos** (opcional): Duración del test en segundos (default: 60)
- **nombre_servicio** (opcional): Nombre del servicio para los eventos (default: load-test-service)

## 📊 Qué muestra el script

### Durante la prueba:
- Progreso cada 5 segundos
- Eventos enviados, aceptados, rechazados y errores
- Tasa actual de eventos/segundo
- Estado del buffer (tamaño/utilización/estado)
- Alertas cuando el buffer está alto o crítico

### Al finalizar:
- Resumen completo de estadísticas
- Comparación entre eventos aceptados y guardados en DB
- Tasa de éxito/recuperación
- Estado final del buffer

## 🔍 Códigos de respuesta

- **202 Accepted**: Evento aceptado y encolado en buffer ✅
- **429 Too Many Requests**: Buffer lleno, sistema aplica backpressure ⚠️
- **503 Service Unavailable**: Sistema bajo presión, no puede aceptar más eventos ⚠️
- **Error**: Error de conexión o del servidor ❌

## 📈 Entendiendo los resultados

### Capacidad teórica del sistema

Con la configuración actual:
- **Buffer**: 50,000 eventos máximo (configurable con `BUFFER_MAX_SIZE`)
- **Batch Worker**: 5,000 eventos cada 1 segundo = 300,000 eventos/minuto teóricos
- **Tasa sostenible**: ~50,000 eventos/minuto sin problemas
- **Límite de batch**: Máximo 10,000 eventos por batch (configurable con `BATCH_MAX_SIZE`)

### Qué esperar

**Carga normal (≤50,000 eventos/minuto):**
- ✅ Todos los eventos deberían ser aceptados (202)
- ✅ Buffer no debería llenarse
- ✅ Todos los eventos deberían guardarse en DB

**Carga alta (50,000-150,000 eventos/minuto):**
- ⚠️ Buffer puede llenarse temporalmente
- ⚠️ Algunos eventos pueden ser rechazados (429/503)
- ✅ Sistema aplica backpressure (comportamiento esperado)
- ✅ Eventos aceptados deberían guardarse en DB

**Carga extrema (>300,000 eventos/minuto):**
- ⚠️ Muchos eventos rechazados (429/503)
- ⚠️ Buffer saturado
- ✅ Sistema no se cae (resiliente)
- ⚠️ Puede tomar tiempo procesar todos los eventos aceptados

## 🎓 Qué aprender del test

1. **Backpressure**: Cuando el buffer se llena, el sistema rechaza eventos con 429/503. Esto es **correcto** - el sistema se protege a sí mismo.

2. **Procesamiento asíncrono**: Los eventos aceptados se procesan en background. Puede tomar tiempo verlos en la DB.

3. **Capacidad del buffer**: El buffer de 10,000 eventos actúa como amortiguador para picos temporales.

4. **Worker throughput**: El worker procesa 500 eventos/segundo. Si llegan más rápido, el buffer crece.

5. **Resiliencia**: El sistema nunca se cae, solo rechaza eventos cuando está saturado.

## 🔧 Configuración del sistema

Para ajustar la capacidad, modifica en `.env`:

```env
BUFFER_MAX_SIZE=50000      # Tamaño máximo del buffer (default: 50000)
BATCH_SIZE=5000            # Eventos por batch (default: 5000)
DRAIN_INTERVAL=1000        # Intervalo de procesamiento (ms) (default: 1000)
BATCH_MAX_SIZE=10000       # Límite máximo del batch para prevenir problemas de memoria
```

**Cálculo de capacidad:**
- Capacidad teórica = `(BATCH_SIZE / DRAIN_INTERVAL) * 60,000` eventos/minuto
- Con valores por defecto: `(5000 / 1000) * 60,000 = 300,000 eventos/minuto`
- **Nota**: El sistema también limita el tamaño del batch con `BATCH_MAX_SIZE` para proteger contra problemas de memoria

## 📝 Notas

- El script espera 30 segundos después de enviar eventos para que el worker termine de procesar
- Los eventos se verifican en la DB consultando por servicio y rango de tiempo
- Si el sistema está bajo carga, puede tomar más tiempo procesar todos los eventos
- El script usa `pageSize: 1000` para las consultas (respeta el límite `MAX_QUERY_LIMIT`)
- Todos los valores de configuración son ahora dinámicos a través de variables de entorno

## 🗑️ Script de limpieza de base de datos

Para limpiar todos los eventos de la base de datos antes de un test:

```bash
npm run clear-db
```

Este script:
- Conecta a la base de datos usando la configuración de NestJS
- Cuenta los eventos existentes
- Elimina todos los eventos
- Verifica que la eliminación fue exitosa

## 🧪 Script de prueba simple

Para pruebas rápidas sin carga, puedes usar el script bash:

```bash
# Probar ingesta de un evento, health check y consulta
./scripts/test-ingestion.sh
```

Este script:
- Envía un evento de prueba
- Verifica el estado del buffer
- Consulta eventos recientes
