export interface IHealthService {
  signalReady(): void;
  signalNotReady(): void;
  registerShutdownHandler(handler: () => void): void;
  isServerReady(): boolean;
  isServerShuttingDown(): boolean;
  shutdown(): void;
  checkHealth(): { status: number; message: string };
  checkLiveness(): { status: number; message: string };
  checkReadiness(): { status: number; message: string };
}
