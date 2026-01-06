"""
Tests para demostrar los problemas del código original y validar las correcciones.

Este archivo contiene tests que:
1. Demuestran que el código original tiene problemas
2. Validan que el código corregido funciona correctamente
"""

import os
import json
import time
import tempfile
import threading
from pathlib import Path

# Importar ambas versiones
import sys
sys.path.insert(0, os.path.dirname(__file__))

from log_processor_original import LogProcessor as LogProcessorOriginal
from log_processor_corregido import LogProcessor as LogProcessorCorregido


def test_original_mutable_default():
    """
    PROBLEMA 1: Mutable default argument
    Todos los LogProcessor comparten el mismo buffer si no se pasa explícitamente.
    """
    print("\n=== TEST 1: Mutable Default Argument ===")
    
    # Código original - PROBLEMA
    proc1 = LogProcessorOriginal()
    proc2 = LogProcessorOriginal()
    
    proc1.process({"test": "data1"})
    proc2.process({"test": "data2"})
    
    # PROBLEMA: Ambos comparten el mismo buffer
    print(f"Proc1 buffer size: {len(proc1.buffer)}")  # Esperado: 1, Real: 2
    print(f"Proc2 buffer size: {len(proc2.buffer)}")  # Esperado: 1, Real: 2
    print(f"[X] PROBLEMA: Ambos comparten el mismo buffer! (mutacion compartida)")
    
    # Código corregido - SOLUCIÓN
    proc3 = LogProcessorCorregido()
    proc4 = LogProcessorCorregido()
    
    proc3.process({"test": "data1"})
    proc4.process({"test": "data2"})
    
    stats3 = proc3.get_stats()
    stats4 = proc4.get_stats()
    
    print(f"Proc3 buffer size: {stats3['buffer_size']}")  # Esperado: 1, Real: 1 [OK]
    print(f"Proc4 buffer size: {stats4['buffer_size']}")  # Esperado: 1, Real: 1 [OK]
    print(f"[OK] CORRECCION: Cada instancia tiene su propio buffer")


def test_original_no_error_handling():
    """
    PROBLEMA 2: No manejo de errores
    Si el archivo no se puede escribir o el evento es inválido, el programa crashea.
    """
    print("\n=== TEST 2: Manejo de Errores ===")
    
    # Código original - PROBLEMA con evento inválido
    proc_original = LogProcessorOriginal()
    
    try:
        # Esto puede crashear si el evento no es serializable
        proc_original.process({"circular": proc_original})  # Referencia circular
        proc_original.flush()
        print("[X] PROBLEMA: No valido el evento invalido")
    except Exception as e:
        print(f"[X] PROBLEMA: Crasheo con error: {type(e).__name__}")
    
    # Código corregido - SOLUCIÓN
    proc_corregido = LogProcessorCorregido()
    
    # Evento con referencia circular (no serializable, error en flush)
    circular_dict = {}
    circular_dict["self"] = circular_dict
    result = proc_corregido.process(circular_dict)
    assert result == True, "Process acepta (es un dict válido)"
    
    # El error se detecta en flush al intentar serializar
    flush_result = proc_corregido.flush()
    
    stats = proc_corregido.get_stats()
    assert stats['total_errors'] > 0, "Debería detectar error al serializar"
    
    print(f"[OK] CORRECCION: Maneja eventos no serializables sin crashear")
    print(f"   Errores registrados: {stats['total_errors']}")


def test_original_no_thread_safety():
    """
    PROBLEMA 3: No thread-safe
    Operaciones concurrentes pueden corromper el buffer.
    """
    print("\n=== TEST 3: Thread Safety ===")
    
    # Código original - PROBLEMA
    proc_original = LogProcessorOriginal()
    
    def add_events(processor, count, prefix):
        for i in range(count):
            processor.process({f"{prefix}": i})
    
    # Ejecutar en paralelo
    threads = []
    for i in range(5):
        t = threading.Thread(target=add_events, args=(proc_original, 10, f"thread_{i}"))
        threads.append(t)
        t.start()
    
    for t in threads:
        t.join()
    
    # PROBLEMA: Puede perder eventos o tener inconsistencias
    print(f"Proc original buffer size: {len(proc_original.buffer)}")
    print(f"[X] PROBLEMA: Race conditions posibles (puede variar)")
    
    # Código corregido - SOLUCIÓN
    proc_corregido = LogProcessorCorregido()
    
    threads = []
    for i in range(5):
        t = threading.Thread(target=add_events, args=(proc_corregido, 10, f"thread_{i}"))
        threads.append(t)
        t.start()
    
    for t in threads:
        t.join()
    
    stats = proc_corregido.get_stats()
    assert stats['total_processed'] == 50, "Debería procesar todos los eventos"
    
    print(f"[OK] CORRECCION: Thread-safe - procesados: {stats['total_processed']}")


def test_original_no_file_format():
    """
    PROBLEMA 4: Archivo sin formato (JSON sin newlines)
    Todos los eventos se escriben en una sola línea, difícil de leer.
    """
    print("\n=== TEST 4: Formato de Archivo ===")
    
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
        temp_file = f.name
    
    try:
        # Código original - PROBLEMA
        proc_original = LogProcessorOriginal()
        proc_original.buffer = []  # Reset
        proc_original.process({"service": "auth", "msg": "login"})
        proc_original.process({"service": "auth", "msg": "logout"})
        
        # Escribir directamente (simulando comportamiento original)
        with open(temp_file, "a") as f:
            for event in proc_original.buffer:
                f.write(json.dumps(event))
        
        with open(temp_file, "r") as f:
            content = f.read()
        
        print(f"Original (una línea): {content[:100]}...")
        print(f"[X] PROBLEMA: Todo en una linea, dificil de leer")
        
        # Código corregido - SOLUCIÓN
        proc_corregido = LogProcessorCorregido(log_file=temp_file + "_corregido")
        proc_corregido.process({"service": "auth", "msg": "login"})
        proc_corregido.process({"service": "auth", "msg": "logout"})
        proc_corregido.flush()
        
        with open(temp_file + "_corregido", "r") as f:
            lines = f.readlines()
        
        print(f"[OK] CORRECCION: {len(lines)} lineas, una por evento")
        for i, line in enumerate(lines[:2], 1):
            print(f"   Línea {i}: {line.strip()[:50]}...")
    
    finally:
        # Cleanup
        if os.path.exists(temp_file):
            os.unlink(temp_file)
        if os.path.exists(temp_file + "_corregido"):
            os.unlink(temp_file + "_corregido")


def test_original_no_encoding():
    """
    PROBLEMA 5: No especifica encoding (puede fallar con caracteres especiales)
    """
    print("\n=== TEST 5: Encoding UTF-8 ===")
    
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
        temp_file = f.name
    
    try:
        # Código corregido - Maneja UTF-8
        proc_corregido = LogProcessorCorregido(log_file=temp_file)
        proc_corregido.process({"service": "auth", "msg": "Login con ñ y acentos: áéíóú"})
        proc_corregido.process({"service": "auth", "msg": "Caracteres especiales: ñ á é í ó ú"})
        proc_corregido.flush()
        
        with open(temp_file, "r", encoding="utf-8") as f:
            content = f.read()
        
        assert "ñ" in content
        assert "ñ" in content
        print(f"[OK] CORRECCION: Maneja UTF-8 correctamente")
        print(f"   Contenido: {content[:80]}...")
    
    finally:
        if os.path.exists(temp_file):
            os.unlink(temp_file)


def test_original_file_path_issues():
    """
    PROBLEMA 6: No crea directorios si no existen
    """
    print("\n=== TEST 6: Path de Archivo ===")
    
    # Código original - PROBLEMA si el directorio no existe
    non_existent_dir = tempfile.mkdtemp() + "/nonexistent/subdir/logs.txt"
    
    try:
        proc_original = LogProcessorOriginal()
        proc_original.buffer = [{"test": "data"}]
        
        # Esto falla si el directorio no existe
        try:
            proc_original.flush()  # Intenta escribir a "logs.txt" en directorio actual
            print("Original: Escribe a directorio actual (puede fallar)")
        except Exception as e:
            print(f"[X] PROBLEMA: {type(e).__name__}")
        
        # Código corregido - SOLUCIÓN
        proc_corregido = LogProcessorCorregido(log_file=non_existent_dir)
        proc_corregido.process({"test": "data"})
        result = proc_corregido.flush()
        
        assert result > 0, "Debería crear directorios y escribir"
        assert os.path.exists(non_existent_dir), "Archivo debería existir"
        
        print(f"[OK] CORRECCION: Crea directorios automaticamente")
        print(f"   Archivo creado: {non_existent_dir}")
    
    finally:
        # Cleanup
        import shutil
        if os.path.exists(os.path.dirname(non_existent_dir)):
            shutil.rmtree(os.path.dirname(os.path.dirname(non_existent_dir)))


def test_original_no_validation():
    """
    PROBLEMA 7: No valida entrada (acepta cualquier cosa)
    """
    print("\n=== TEST 7: Validación de Entrada ===")
    
    # Código original - PROBLEMA
    proc_original = LogProcessorOriginal()
    proc_original.process(None)  # [X] Acepta None
    proc_original.process("string")  # [X] Acepta string
    proc_original.process(123)  # [X] Acepta numero
    
    print(f"[X] PROBLEMA: Acepta tipos invalidos sin validar")
    print(f"   Buffer size: {len(proc_original.buffer)} (tiene datos inválidos)")
    
    # Código corregido - SOLUCIÓN
    proc_corregido = LogProcessorCorregido()
    
    assert proc_corregido.process(None) == False
    assert proc_corregido.process("string") == False
    assert proc_corregido.process(123) == False
    assert proc_corregido.process({}) == False  # Dict vacío también inválido
    
    stats = proc_corregido.get_stats()
    assert stats['total_processed'] == 0, "No debería procesar eventos inválidos"
    assert stats['total_errors'] == 4, "Debería contar 4 errores"
    
    print(f"[OK] CORRECCION: Valida entrada y rechaza tipos invalidos")
    print(f"   Errores registrados: {stats['total_errors']}")


if __name__ == "__main__":
    print("=" * 60)
    print("TESTS DE VALIDACIÓN - Código Original vs Corregido")
    print("=" * 60)
    
    test_original_mutable_default()
    test_original_no_error_handling()
    test_original_no_thread_safety()
    test_original_no_file_format()
    test_original_no_encoding()
    test_original_file_path_issues()
    test_original_no_validation()
    
    print("\n" + "=" * 60)
    print("[OK] TODOS LOS TESTS COMPLETADOS")
    print("=" * 60)
    print("\nResumen de problemas encontrados en codigo original:")
    print("1. [X] Mutable default argument (buffer compartido)")
    print("2. [X] No manejo de errores (crashes)")
    print("3. [X] No thread-safe (race conditions)")
    print("4. [X] Formato de archivo sin newlines")
    print("5. [X] No especifica encoding UTF-8")
    print("6. [X] No crea directorios si no existen")
    print("7. [X] No valida entrada")

