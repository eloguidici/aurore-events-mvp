import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Script para ejecutar múltiples load tests en paralelo
 * 
 * Uso:
 *   ts-node scripts/parallel-load-test.ts [num_clientes] [eventos_por_minuto] [duracion_segundos]
 * 
 * Ejemplos:
 *   ts-node scripts/parallel-load-test.ts 10 30000 60    # 10 clientes, 30K eventos/min cada uno = 300K eventos/min total
 *   ts-node scripts/parallel-load-test.ts 15 20000 60    # 15 clientes, 20K eventos/min cada uno = 300K eventos/min total
 *   ts-node scripts/parallel-load-test.ts 20 15000 60    # 20 clientes, 15K eventos/min cada uno = 300K eventos/min total
 */

const numClients = parseInt(process.argv[2] || '10', 10);
const eventsPerMinute = parseInt(process.argv[3] || '30000', 10);
const durationSeconds = parseInt(process.argv[4] || '60', 10);

const totalEventsPerMinute = numClients * eventsPerMinute;
const totalEventsPerSecond = totalEventsPerMinute / 60;

console.log('🚀 PARALLEL LOAD TEST - Sistema de Eventos');
console.log('================================================');
console.log(`Número de clientes: ${numClients}`);
console.log(`Eventos por minuto por cliente: ${eventsPerMinute.toLocaleString()}`);
console.log(`Duración: ${durationSeconds} segundos`);
console.log(`Total esperado: ${totalEventsPerMinute.toLocaleString()} eventos/minuto (${totalEventsPerSecond.toFixed(2)} eventos/segundo)`);
console.log('================================================\n');

const scriptPath = path.resolve(__dirname, 'load-test.ts');
const processes: Array<{ process: any; clientId: number }> = [];

// Iniciar todos los clientes
console.log(`📡 Iniciando ${numClients} clientes en paralelo...\n`);

for (let i = 0; i < numClients; i++) {
  const clientId = i + 1;
  const serviceName = `parallel-load-test-${Date.now()}-client-${clientId}`;
  
  // Usar npm run load-test directamente para evitar problemas con paths
  const childProcess = spawn('npm', [
    'run',
    'load-test',
    eventsPerMinute.toString(),
    durationSeconds.toString(),
    serviceName,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    cwd: process.cwd(),
    env: process.env,
  });

  processes.push({ process: childProcess, clientId });

  // Capturar salida de cada proceso
  childProcess.stdout.on('data', (data) => {
    const output = data.toString();
    // Solo mostrar errores críticos o resúmenes
    if (output.includes('ERROR') || output.includes('RESUMEN') || output.includes('COMPARACIÓN')) {
      console.log(`[Cliente ${clientId}] ${output}`);
    }
  });

  childProcess.stderr.on('data', (data) => {
    console.error(`[Cliente ${clientId} ERROR] ${data.toString()}`);
  });

  childProcess.on('exit', (code) => {
    if (code === 0) {
      console.log(`✅ Cliente ${clientId} completado exitosamente`);
    } else {
      console.error(`❌ Cliente ${clientId} terminó con código ${code}`);
    }
  });
}

console.log(`✅ Todos los ${numClients} clientes iniciados\n`);
console.log('⏳ Esperando que todos los clientes terminen...\n');

// Esperar a que todos terminen
Promise.all(
  processes.map(({ process }) => {
    return new Promise<void>((resolve) => {
      process.on('exit', () => resolve());
    });
  })
).then(() => {
  console.log('\n================================================');
  console.log('✅ TODOS LOS CLIENTES COMPLETARON');
  console.log('================================================');
  console.log(`Total esperado: ${totalEventsPerMinute.toLocaleString()} eventos/minuto`);
  console.log(`Tasa objetivo: ${totalEventsPerSecond.toFixed(2)} eventos/segundo`);
  console.log('\n💡 Verifica los resultados en la base de datos:');
  console.log('   docker-compose exec postgres psql -U admin -d aurore_events -c "SELECT COUNT(*) FROM events WHERE service LIKE \'parallel-load-test-%\';"');
});

