# log_processor.py
# Código original - Versión con problemas (escrito por junior)

import time
import json

class LogProcessor:
    def __init__(self, buffer=[]):
        self.buffer = buffer

    def process(self, log_event: dict):
        self.buffer.append(log_event)
        if len(self.buffer) > 100:
            self.flush()

    def flush(self):
        with open("logs.txt", "a") as f:
            for event in self.buffer:
                f.write(json.dumps(event))
            self.buffer.clear()


processor = LogProcessor()

# Example usage
processor.process({"service": "auth", "msg": "login", "ts": time.time()})

