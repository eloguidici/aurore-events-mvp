import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';
import { MESSAGES } from './modules/common/constants/constants';
import { HealthService } from './modules/common/services/health.service';
import { ERROR_LOGGER_SERVICE_TOKEN } from './modules/common/services/interfaces/error-logger-service.token';

describe('AppController', () => {
  let controller: AppController;
  let healthService: HealthService;
  let errorLogger: any;

  const mockErrorLogger = {
    logError: jest.fn(),
    logWarning: jest.fn(),
    createContext: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        HealthService,
        {
          provide: ERROR_LOGGER_SERVICE_TOKEN,
          useValue: mockErrorLogger,
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
    healthService = module.get<HealthService>(HealthService);
    errorLogger = module.get(ERROR_LOGGER_SERVICE_TOKEN);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('healthCheck', () => {
    it('should return health status when server is ready', () => {
      healthService.signalReady();

      const result = controller.healthCheck();

      expect(result).toEqual({ message: MESSAGES.SERVER_IS_READY });
    });

    it('should throw HttpException when server is not ready', () => {
      healthService.signalNotReady();

      expect(() => controller.healthCheck()).toThrow(HttpException);

      try {
        controller.healthCheck();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.SERVICE_UNAVAILABLE,
        );
        expect((error as HttpException).getResponse()).toBe(
          MESSAGES.SERVER_IS_NOT_READY,
        );
      }
    });

    it('should throw HttpException when server is shutting down', () => {
      healthService.shutdown();

      expect(() => controller.healthCheck()).toThrow(HttpException);

      try {
        controller.healthCheck();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.SERVICE_UNAVAILABLE,
        );
        expect((error as HttpException).getResponse()).toBe(
          MESSAGES.SERVER_IS_SHUTTING_DOWN,
        );
      }
    });

    it('should handle unexpected errors and log them', () => {
      const unexpectedError = new Error('Unexpected error');
      jest.spyOn(healthService, 'checkHealth').mockImplementation(() => {
        throw unexpectedError;
      });

      expect(() => controller.healthCheck()).toThrow(HttpException);

      expect(errorLogger.logError).toHaveBeenCalledWith(
        expect.any(Object),
        'Unexpected error in health check',
        unexpectedError,
      );

      try {
        controller.healthCheck();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
        const response = (error as HttpException).getResponse() as any;
        expect(response.status).toBe('error');
        expect(response.message).toBe('Health check failed');
      }
    });

    it('should re-throw HttpException when healthService throws HttpException', () => {
      const httpException = new HttpException(
        'Service unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      jest.spyOn(healthService, 'checkHealth').mockImplementation(() => {
        throw httpException;
      });

      expect(() => controller.healthCheck()).toThrow(HttpException);

      try {
        controller.healthCheck();
      } catch (error) {
        expect(error).toBe(httpException);
        expect(errorLogger.logError).not.toHaveBeenCalled();
      }
    });
  });

  describe('livenessCheck', () => {
    it('should return liveness status when server is not shutting down', () => {
      healthService.signalReady();

      const result = controller.livenessCheck();

      expect(result).toEqual({
        message: MESSAGES.SERVER_IS_NOT_SHUTTING_DOWN,
      });
    });

    it('should throw HttpException when server is shutting down', () => {
      healthService.shutdown();

      expect(() => controller.livenessCheck()).toThrow(HttpException);

      try {
        controller.livenessCheck();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.SERVICE_UNAVAILABLE,
        );
        expect((error as HttpException).getResponse()).toBe(
          MESSAGES.SERVER_IS_SHUTTING_DOWN,
        );
      }
    });

    it('should handle unexpected errors and log them', () => {
      const unexpectedError = new Error('Unexpected error');
      jest.spyOn(healthService, 'checkLiveness').mockImplementation(() => {
        throw unexpectedError;
      });

      expect(() => controller.livenessCheck()).toThrow(HttpException);

      expect(errorLogger.logError).toHaveBeenCalledWith(
        expect.any(Object),
        'Unexpected error in liveness check',
        unexpectedError,
      );

      try {
        controller.livenessCheck();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
        const response = (error as HttpException).getResponse() as any;
        expect(response.status).toBe('error');
        expect(response.message).toBe('Liveness check failed');
      }
    });

    it('should re-throw HttpException when healthService throws HttpException', () => {
      const httpException = new HttpException(
        'Service unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      jest.spyOn(healthService, 'checkLiveness').mockImplementation(() => {
        throw httpException;
      });

      expect(() => controller.livenessCheck()).toThrow(HttpException);

      try {
        controller.livenessCheck();
      } catch (error) {
        expect(error).toBe(httpException);
        expect(errorLogger.logError).not.toHaveBeenCalled();
      }
    });
  });

  describe('readinessCheck', () => {
    it('should return readiness status when server is ready', () => {
      healthService.signalReady();

      const result = controller.readinessCheck();

      expect(result).toEqual({ message: MESSAGES.SERVER_IS_READY });
    });

    it('should throw HttpException when server is not ready', () => {
      healthService.signalNotReady();

      expect(() => controller.readinessCheck()).toThrow(HttpException);

      try {
        controller.readinessCheck();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.SERVICE_UNAVAILABLE,
        );
        expect((error as HttpException).getResponse()).toBe(
          MESSAGES.SERVER_IS_NOT_READY,
        );
      }
    });

    it('should handle unexpected errors and log them', () => {
      const unexpectedError = new Error('Unexpected error');
      jest.spyOn(healthService, 'checkReadiness').mockImplementation(() => {
        throw unexpectedError;
      });

      expect(() => controller.readinessCheck()).toThrow(HttpException);

      expect(errorLogger.logError).toHaveBeenCalledWith(
        expect.any(Object),
        'Unexpected error in readiness check',
        unexpectedError,
      );

      try {
        controller.readinessCheck();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
        const response = (error as HttpException).getResponse() as any;
        expect(response.status).toBe('error');
        expect(response.message).toBe('Readiness check failed');
      }
    });

    it('should re-throw HttpException when healthService throws HttpException', () => {
      const httpException = new HttpException(
        'Service unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      jest.spyOn(healthService, 'checkReadiness').mockImplementation(() => {
        throw httpException;
      });

      expect(() => controller.readinessCheck()).toThrow(HttpException);

      try {
        controller.readinessCheck();
      } catch (error) {
        expect(error).toBe(httpException);
        expect(errorLogger.logError).not.toHaveBeenCalled();
      }
    });
  });
});
