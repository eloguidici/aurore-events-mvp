import axios from 'axios';

/**
 * Script unificado de load testing
 * 
 * Uso:
 *   npm run load-test [eventos_por_minuto] [duracion_segundos] [nombre_servicio]
 * 
 * Ejemplos:
 *   npm run load-test 5000          # 5000 eventos/min por 60 segundos
 *   npm run load-test 10000 30      # 10000 eventos/min por 30 segundos
 *   npm run load-test 20000 120 test-service  # 20000 eventos/min por 120 segundos
 */

interface MetricsResponse {
  status: 'healthy' | 'warning' | 'critical';
  buffer: {
    size: number;
    capacity: number;
    utilization_percent: string;
  };
  metrics: {
    total_enqueued: number;
    total_dropped: number;
    drop_rate_percent: string;
    throughput_events_per_second: string;
  };
}

interface QueryResponse {
  total: number;
  items: any[];
  page: number;
  pageSize: number;
}

interface TestStats {
  totalSent: number;
  accepted: number;
  rejected429: number;
  rejected503: number;
  errors: number;
  startTime: number;
  endTime?: number;
}

interface EventData {
  timestamp: string;
  service: string;
  message: string;
  metadata?: Record<string, any>;
}

const API_URL = process.env.API_URL || 'http://localhost:3000';
const EVENTS_ENDPOINT = `${API_URL}/events`;
const METRICS_ENDPOINT = `${API_URL}/health/buffer`;

/**
 * Genera un evento de prueba
 */
function generateEvent(serviceName: string, index: number): EventData {
  return {
    timestamp: new Date().toISOString(),
    service: serviceName,
    message: `Test event #${index} - Load testing event`,
    metadata: {
      testId: `test-${Date.now()}-${index}`,
      loadTest: true,
      index,
    },
  };
}

/**
 * Envía un evento y retorna el resultado
 */
async function sendEvent(event: EventData): Promise<'accepted' | '429' | '503' | 'error'> {
  try {
    const response = await axios.post(EVENTS_ENDPOINT, event, {
      validateStatus: (status) => status < 500,
      timeout: 5000,
    });

    if (response.status === 202) return 'accepted';
    if (response.status === 429) return '429';
    if (response.status === 503) return '503';
    return 'error';
  } catch (error) {
    return 'error';
  }
}

/**
 * Obtiene métricas del buffer
 */
async function getMetrics(): Promise<MetricsResponse | null> {
  try {
    const response = await axios.get<MetricsResponse>(METRICS_ENDPOINT);
    return response.data;
  } catch (error) {
    return null;
  }
}

/**
 * Ejecuta el load test con la tasa especificada
 */
async function runLoadTest(
  eventsPerMinute: number,
  durationSeconds: number,
  serviceName: string = 'load-test-service',
): Promise<TestStats> {
  const stats: TestStats = {
    totalSent: 0,
    accepted: 0,
    rejected429: 0,
    rejected503: 0,
    errors: 0,
    startTime: Date.now(),
  };

  const eventsPerSecond = eventsPerMinute / 60;
  const totalEvents = Math.floor(eventsPerMinute * (durationSeconds / 60));
  
  // Calcular delay entre eventos para respetar la tasa objetivo
  // Si queremos X eventos/segundo, el delay entre cada evento es 1000/X ms
  const delayBetweenEvents = 1000 / eventsPerSecond; // milisegundos

  console.log('\n' + '='.repeat(80));
  console.log('🚀 LOAD TEST - Sistema de Eventos');
  console.log('='.repeat(80));
  console.log(`Tasa objetivo: ${eventsPerMinute.toLocaleString()} eventos/minuto (${eventsPerSecond.toFixed(2)} eventos/segundo)`);
  console.log(`Duración: ${durationSeconds} segundos`);
  console.log(`Eventos esperados: ~${totalEvents.toLocaleString()}`);
  console.log(`Delay entre eventos: ${delayBetweenEvents.toFixed(2)}ms`);
  console.log(`Servicio: ${serviceName}`);
  console.log('='.repeat(80) + '\n');

  // Mostrar métricas iniciales
  const initialMetrics = await getMetrics();
  if (initialMetrics) {
    console.log('📊 Estado inicial del buffer:');
    console.log(`   Tamaño: ${initialMetrics.buffer.size}/${initialMetrics.buffer.capacity}`);
    console.log(`   Utilización: ${initialMetrics.buffer.utilization_percent}%`);
    console.log(`   Estado: ${initialMetrics.status}`);
    console.log('');
  }

  // Configuración de envío
  const promises: Promise<void>[] = [];
  let eventIndex = 0;
  
  // Intervalo de reporte
  let lastReportTime = Date.now();
  const reportInterval = 5000; // Reportar cada 5 segundos

  // Función para enviar un evento
  const sendEventWithStats = async (index: number): Promise<void> => {
    const event = generateEvent(serviceName, index);
    stats.totalSent++;

    const result = await sendEvent(event);
    switch (result) {
      case 'accepted':
        stats.accepted++;
        break;
      case '429':
        stats.rejected429++;
        break;
      case '503':
        stats.rejected503++;
        break;
      case 'error':
        stats.errors++;
        break;
    }
  };

  // Enviar eventos respetando la tasa objetivo usando ventana de 1 segundo
  const sendEvents = async () => {
    const startTime = Date.now();
    const endTime = startTime + (durationSeconds * 1000);
    
    while (Date.now() < endTime && eventIndex < totalEvents) {
      const windowStart = Date.now();
      // Calcular cuántos eventos enviar en esta ventana de 1 segundo
      const eventsThisSecond = Math.min(
        Math.floor(eventsPerSecond),
        totalEvents - eventIndex
      );
      
      // Enviar eventos para esta ventana de 1 segundo
      const windowPromises: Promise<void>[] = [];
      for (let i = 0; i < eventsThisSecond && eventIndex < totalEvents && Date.now() < endTime; i++) {
        const currentIndex = eventIndex++;
        windowPromises.push(sendEventWithStats(currentIndex));
        promises.push(windowPromises[windowPromises.length - 1]);
      }

      // Esperar a que terminen los envíos de esta ventana
      await Promise.allSettled(windowPromises);

      // Ajustar el tiempo para mantener exactamente 1 segundo por ventana
      const windowDuration = Date.now() - windowStart;
      const waitTime = Math.max(0, 1000 - windowDuration);
      
      if (waitTime > 0 && Date.now() < endTime && eventIndex < totalEvents) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      // Reporte periódico de progreso
      const now = Date.now();
      if (now - lastReportTime >= reportInterval) {
        lastReportTime = now;
        const elapsed = (now - stats.startTime) / 1000;
        const rate = stats.totalSent / elapsed;
        const metrics = await getMetrics();

        console.log(`⏱️  Progreso (${elapsed.toFixed(1)}s):`);
        console.log(`   Enviados: ${stats.totalSent.toLocaleString()} | Aceptados: ${stats.accepted.toLocaleString()} | Rechazados: ${(stats.rejected429 + stats.rejected503).toLocaleString()} | Errores: ${stats.errors.toLocaleString()}`);
        console.log(`   Tasa actual: ${rate.toFixed(2)} eventos/segundo (objetivo: ${eventsPerSecond.toFixed(2)})`);
        if (metrics) {
          const utilization = parseFloat(metrics.buffer.utilization_percent);
          console.log(`   Buffer: ${metrics.buffer.size}/${metrics.buffer.capacity} (${metrics.buffer.utilization_percent}%) - Estado: ${metrics.status}`);
          if (utilization > 90) {
            console.log(`   🔴 BUFFER CRÍTICO - Backpressure activo!`);
          } else if (utilization > 70) {
            console.log(`   ⚠️  Buffer alto - Backpressure puede activarse`);
          }
        }
        console.log('');
      }
    }
  };

  // Iniciar envío de eventos
  await sendEvents();

  // Esperar a que todas las peticiones pendientes terminen
  console.log('⏳ Esperando que terminen las peticiones pendientes...');
  await Promise.allSettled(promises);

  stats.endTime = Date.now();

  // Métricas finales
  const finalMetrics = await getMetrics();
  if (finalMetrics) {
    console.log('\n📊 Estado final del buffer:');
    console.log(`   Tamaño: ${finalMetrics.buffer.size}/${finalMetrics.buffer.capacity}`);
    console.log(`   Utilización: ${finalMetrics.buffer.utilization_percent}%`);
    console.log(`   Estado: ${finalMetrics.status}`);
    console.log(`   Total encolados: ${finalMetrics.metrics.total_enqueued.toLocaleString()}`);
    console.log(`   Total rechazados: ${finalMetrics.metrics.total_dropped.toLocaleString()}`);
    console.log(`   Tasa de rechazo: ${finalMetrics.metrics.drop_rate_percent}%`);
    console.log(`   Throughput: ${finalMetrics.metrics.throughput_events_per_second} eventos/segundo`);
  }

  return stats;
}

/**
 * Espera a que el buffer se vacíe y verifica eventos en la base de datos
 */
async function waitAndVerify(serviceName: string, expectedMin: number) {
  console.log('\n⏳ Esperando que el buffer se vacíe (30 segundos)...');
  await new Promise((resolve) => setTimeout(resolve, 30000));

  console.log('🔍 Verificando eventos en la base de datos...');
  try {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    const from = oneMinuteAgo.toISOString();
    const to = now.toISOString();

    const response = await axios.get<QueryResponse>(`${API_URL}/events`, {
      params: {
        service: serviceName,
        from,
        to,
        page: 1,
        pageSize: 1000, // Max limit is 1000 (MAX_QUERY_LIMIT)
      },
    });

    const savedCount = response.data.total;
    const savedItems = response.data.items.length;

    console.log(`\n✅ Resultados de verificación:`);
    console.log(`   Eventos guardados en DB: ${savedCount.toLocaleString()}`);
    console.log(`   Eventos retornados en query: ${savedItems.toLocaleString()}`);
    console.log(`   Mínimo esperado: ${expectedMin.toLocaleString()}`);
    if (expectedMin > 0) {
      const successRate = (savedCount / expectedMin) * 100;
      console.log(`   Tasa de éxito: ${successRate.toFixed(2)}%`);

      if (successRate >= 95) {
        console.log(`   ✅ EXCELENTE: Al menos 95% de eventos fueron guardados`);
      } else if (successRate >= 80) {
        console.log(`   ⚠️  BUENO: La mayoría de eventos fueron guardados, algunos pueden estar procesándose`);
      } else {
        console.log(`   ⚠️  ADVERTENCIA: Menos del 80% de eventos fueron guardados`);
      }
    }

    return savedCount;
  } catch (error: any) {
    console.error(`   ❌ Error verificando eventos: ${error.message}`);
    return 0;
  }
}

/**
 * Imprime el resumen del test
 */
function printSummary(stats: TestStats) {
  const duration = ((stats.endTime || Date.now()) - stats.startTime) / 1000;
  const actualRate = stats.totalSent / duration;

  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMEN DEL LOAD TEST');
  console.log('='.repeat(80));
  console.log(`Duración: ${duration.toFixed(2)} segundos`);
  console.log(`Total de eventos enviados: ${stats.totalSent.toLocaleString()}`);
  console.log(`Tasa real: ${actualRate.toFixed(2)} eventos/segundo (${(actualRate * 60).toFixed(2)} eventos/minuto)`);
  console.log('');
  console.log('Resultados:');
  const acceptedPercent = stats.totalSent > 0 ? ((stats.accepted / stats.totalSent) * 100).toFixed(2) : '0.00';
  const rejected429Percent = stats.totalSent > 0 ? ((stats.rejected429 / stats.totalSent) * 100).toFixed(2) : '0.00';
  const rejected503Percent = stats.totalSent > 0 ? ((stats.rejected503 / stats.totalSent) * 100).toFixed(2) : '0.00';
  const errorsPercent = stats.totalSent > 0 ? ((stats.errors / stats.totalSent) * 100).toFixed(2) : '0.00';

  console.log(`  ✅ Aceptados (202): ${stats.accepted.toLocaleString()} (${acceptedPercent}%)`);
  console.log(`  ⚠️  Rechazados - Buffer lleno (429): ${stats.rejected429.toLocaleString()} (${rejected429Percent}%)`);
  console.log(`  ⚠️  Rechazados - Servicio no disponible (503): ${stats.rejected503.toLocaleString()} (${rejected503Percent}%)`);
  console.log(`  ❌ Errores: ${stats.errors.toLocaleString()} (${errorsPercent}%)`);
  console.log('');
  console.log('Comportamiento del sistema:');
  if (stats.rejected429 > 0 || stats.rejected503 > 0) {
    console.log('  ⚠️  El sistema aplicó backpressure (saturación del buffer detectada)');
    console.log('  ℹ️  Este es el comportamiento esperado cuando la carga excede la capacidad de procesamiento');
  } else {
    console.log('  ✅ El sistema manejó todos los eventos sin backpressure');
  }
  console.log('='.repeat(80) + '\n');
}

/**
 * Función principal
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Validar argumentos
  if (args.length === 0) {
    console.log('🧪 Load Test - Sistema de Eventos');
    console.log('');
    console.log('Uso:');
    console.log('  npm run load-test [eventos_por_minuto] [duracion_segundos] [nombre_servicio]');
    console.log('');
    console.log('Ejemplos:');
    console.log('  npm run load-test 5000          # 5000 eventos/min por 60 segundos');
    console.log('  npm run load-test 10000 30      # 10000 eventos/min por 30 segundos');
    console.log('  npm run load-test 20000 120 test-service  # 20000 eventos/min por 120 segundos');
    console.log('');
    console.log('Parámetros:');
    console.log('  eventos_por_minuto  - Cantidad de eventos a enviar por minuto (requerido)');
    console.log('  duracion_segundos   - Duración del test en segundos (default: 60)');
    console.log('  nombre_servicio     - Nombre del servicio para los eventos (default: load-test-service)');
    process.exit(1);
  }

  const eventsPerMinute = parseInt(args[0], 10);
  if (isNaN(eventsPerMinute) || eventsPerMinute <= 0) {
    console.error('❌ Error: eventos_por_minuto debe ser un número positivo');
    process.exit(1);
  }

  const durationSeconds = args[1] ? parseInt(args[1], 10) : 60;
  if (isNaN(durationSeconds) || durationSeconds <= 0) {
    console.error('❌ Error: duracion_segundos debe ser un número positivo');
    process.exit(1);
  }

  const serviceName = args[2] || `load-test-${Date.now()}`;

  console.log('🧪 Load Test - Sistema de Eventos');
  console.log(`API URL: ${API_URL}`);
  console.log(`Servicio: ${serviceName}\n`);

  // Verificar que la API esté disponible
  try {
    await axios.get(`${API_URL}/health`);
    console.log('✅ API disponible\n');
  } catch (error) {
    console.error('❌ API no disponible. Asegúrate de que el servidor esté corriendo.');
    console.error(`   Intentado: ${API_URL}/health`);
    process.exit(1);
  }

  // Ejecutar load test
  const stats = await runLoadTest(eventsPerMinute, durationSeconds, serviceName);

  // Imprimir resumen
  printSummary(stats);

  // Esperar y verificar
  const savedCount = await waitAndVerify(serviceName, stats.accepted);

  // Comparación final
  console.log('\n' + '='.repeat(80));
  console.log('📈 COMPARACIÓN FINAL');
  console.log('='.repeat(80));
  console.log(`Eventos aceptados por API: ${stats.accepted.toLocaleString()}`);
  console.log(`Eventos guardados en base de datos: ${savedCount.toLocaleString()}`);
  if (savedCount > 0 && stats.accepted > 0) {
    const recoveryRate = (savedCount / stats.accepted) * 100;
    console.log(`Tasa de recuperación: ${recoveryRate.toFixed(2)}%`);
    if (recoveryRate >= 95) {
      console.log('✅ Excelente: El sistema procesó y guardó los eventos exitosamente');
    } else if (recoveryRate >= 80) {
      console.log('⚠️  Bueno: La mayoría de eventos fueron guardados, algunos pueden estar procesándose');
    } else {
      console.log('⚠️  Advertencia: Algunos eventos pueden no haber sido guardados aún');
    }
  }
  console.log('='.repeat(80) + '\n');
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Test falló:', error);
    process.exit(1);
  });
}

export { runLoadTest, printSummary };
