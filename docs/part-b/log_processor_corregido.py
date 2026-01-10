# log_processor_corregido.py
# Versión corregida - Mejoras aplicadas

import time
import json
import os
from pathlib import Path
from typing import Dict, List, Optional
from threading import Lock


class LogProcessor:
    """
    Procesador de logs mejorado con manejo de errores, thread-safety y mejores prácticas.
    
    Mejoras aplicadas:
    1. Buffer mutable por defecto corregido (usar None y crear lista nueva)
    2. Thread-safety para operaciones concurrentes
    3. Manejo de errores robusto
    4. Validación de entrada
    5. Flush automático y manual
    6. Path seguro para archivo de logs
    7. Formato JSON con newlines para legibilidad
    8. Encoding explícito (UTF-8)
    9. Métodos para obtener estado del buffer
    """

    def __init__(self, buffer: Optional[List[Dict]] = None, buffer_size: int = 100, log_file: str = "logs.txt"):
        """
        Inicializa el procesador de logs.
        
        Args:
            buffer: Lista de eventos (None por defecto para evitar mutable default)
            buffer_size: Tamaño máximo del buffer antes de flush automático
            log_file: Ruta al archivo de logs
        """
        # CORRECCIÓN 1: Evitar mutable default argument
        self.buffer = buffer if buffer is not None else []
        
        # CORRECCIÓN 2: Buffer size configurable
        self.buffer_size = buffer_size
        
        # CORRECCIÓN 3: Path seguro para archivo
        self.log_file = Path(log_file)
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        
        # CORRECCIÓN 4: Thread-safety
        self.lock = Lock()
        
        # Estadísticas
        self.total_processed = 0
        self.total_written = 0
        self.total_errors = 0

    def process(self, log_event: Dict) -> bool:
        """
        Procesa un evento de log.
        
        Args:
            log_event: Diccionario con los datos del evento
            
        Returns:
            bool: True si se procesó correctamente, False en caso de error
        """
        # CORRECCIÓN 5: Validación de entrada
        if not isinstance(log_event, dict):
            self.total_errors += 1
            return False
        
        if not log_event:
            self.total_errors += 1
            return False
        
        try:
            # CORRECCIÓN 6: Thread-safe append
            with self.lock:
                self.buffer.append(log_event)
                self.total_processed += 1
                
                # Flush automático cuando se alcanza el tamaño
                if len(self.buffer) >= self.buffer_size:
                    self.flush()
            
            return True
            
        except Exception as e:
            self.total_errors += 1
            print(f"Error procesando evento: {e}")
            return False

    def flush(self) -> int:
        """
        Escribe todos los eventos del buffer al archivo y limpia el buffer.
        
        Returns:
            int: Número de eventos escritos, o -1 si hubo error
        """
        if not self.buffer:
            return 0
        
        # CORRECCIÓN 7: Thread-safe flush
        with self.lock:
            # Copiar buffer para no bloquear mientras escribimos
            events_to_write = self.buffer.copy()
            self.buffer.clear()
        
        try:
            # CORRECCIÓN 8: Manejo seguro de archivos
            # CORRECCIÓN 9: Encoding explícito
            # CORRECCIÓN 10: Modo append seguro
            with open(self.log_file, "a", encoding="utf-8") as f:
                for event in events_to_write:
                    try:
                        # CORRECCIÓN 11: Formato JSON con newline para legibilidad
                        json_line = json.dumps(event, ensure_ascii=False)
                        f.write(json_line + "\n")
                        self.total_written += 1
                    except (TypeError, ValueError) as e:
                        # Evento inválido, lo saltamos pero lo registramos
                        self.total_errors += 1
                        print(f"Error serializando evento: {e}")
                        continue
            
            return len(events_to_write)
            
        except (IOError, OSError) as e:
            # CORRECCIÓN 12: Manejo de errores de I/O
            print(f"Error escribiendo a archivo: {e}")
            # Re-agregar eventos al buffer para reintentar después
            with self.lock:
                self.buffer.extend(events_to_write)
            self.total_errors += 1
            return -1

    def get_stats(self) -> Dict:
        """
        Retorna estadísticas del procesador.
        
        Returns:
            Dict con estadísticas
        """
        with self.lock:
            return {
                "buffer_size": len(self.buffer),
                "total_processed": self.total_processed,
                "total_written": self.total_written,
                "total_errors": self.total_errors,
                "log_file": str(self.log_file),
            }


# Ejemplo de uso mejorado
if __name__ == "__main__":
    # CORRECCIÓN 13: Instancia con configuración explícita
    processor = LogProcessor(buffer_size=100, log_file="logs.txt")
    
    # Procesar algunos eventos
    processor.process({"service": "auth", "msg": "login", "ts": time.time()})
    processor.process({"service": "auth", "msg": "logout", "ts": time.time()})
    
    # Flush manual si es necesario
    processor.flush()
    
    # Ver estadísticas
    print(processor.get_stats())

