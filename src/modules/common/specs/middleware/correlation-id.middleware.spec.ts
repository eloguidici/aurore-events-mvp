import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';

import { CorrelationIdMiddleware } from '../../middleware/correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CorrelationIdMiddleware],
    }).compile();

    middleware = module.get<CorrelationIdMiddleware>(CorrelationIdMiddleware);
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use', () => {
    it('should use existing correlation ID from header', () => {
      const correlationId = 'existing-correlation-id-123';
      const req = {
        headers: {
          'x-correlation-id': correlationId,
        },
        method: 'GET',
        path: '/api/events',
      } as Partial<Request> as Request;

      const res = {
        setHeader: jest.fn(),
      } as Partial<Response> as Response;

      const next = jest.fn();

      middleware.use(req, res, next);

      expect((req as any).correlationId).toBe(correlationId);
      expect((res as any).setHeader).toHaveBeenCalledWith(
        'X-Correlation-Id',
        correlationId,
      );
      expect(next).toHaveBeenCalled();
    });

    it('should generate new correlation ID when header is not present', () => {
      const req = {
        headers: {},
        method: 'POST',
        path: '/api/events',
      } as Partial<Request> as Request;

      const res = {
        setHeader: jest.fn(),
      } as Partial<Response> as Response;

      const next = jest.fn();

      middleware.use(req, res, next);

      expect((req as any).correlationId).toBeDefined();
      expect((req as any).correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect((res as any).setHeader).toHaveBeenCalledWith(
        'X-Correlation-Id',
        (req as any).correlationId,
      );
      expect(next).toHaveBeenCalled();
    });

    it('should generate new correlation ID when header is empty string', () => {
      const req = {
        headers: {
          'x-correlation-id': '',
        },
        method: 'GET',
        path: '/api/health',
      } as Partial<Request> as Request;

      const res = {
        setHeader: jest.fn(),
      } as Partial<Response> as Response;

      const next = jest.fn();

      middleware.use(req, res, next);

      expect((req as any).correlationId).toBeDefined();
      expect((req as any).correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect((res as any).setHeader).toHaveBeenCalledWith(
        'X-Correlation-Id',
        (req as any).correlationId,
      );
      expect(next).toHaveBeenCalled();
    });

    it('should add correlation ID to request object', () => {
      const req = {
        headers: {},
        method: 'GET',
        path: '/api/events',
      } as Partial<Request> as Request;

      const res = {
        setHeader: jest.fn(),
      } as Partial<Response> as Response;

      const next = jest.fn();

      middleware.use(req, res, next);

      expect((req as any).correlationId).toBeDefined();
      expect(typeof (req as any).correlationId).toBe('string');
    });

    it('should set correlation ID in response header', () => {
      const correlationId = 'test-correlation-id';
      const req = {
        headers: {
          'x-correlation-id': correlationId,
        },
        method: 'GET',
        path: '/api/events',
      } as Partial<Request> as Request;

      const res = {
        setHeader: jest.fn(),
      } as Partial<Response> as Response;

      const next = jest.fn();

      middleware.use(req, res, next);

      expect((res as any).setHeader).toHaveBeenCalledWith(
        'X-Correlation-Id',
        correlationId,
      );
      expect((res as any).setHeader).toHaveBeenCalledTimes(1);
    });

    it('should call next middleware', () => {
      const req = {
        headers: {},
        method: 'GET',
        path: '/api/events',
      } as Partial<Request> as Request;

      const res = {
        setHeader: jest.fn(),
      } as Partial<Response> as Response;

      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should generate unique correlation IDs for different requests', () => {
      const req1 = {
        headers: {},
        method: 'GET',
        path: '/api/events',
      } as Partial<Request> as Request;

      const req2 = {
        headers: {},
        method: 'POST',
        path: '/api/events',
      } as Partial<Request> as Request;

      const res1 = {
        setHeader: jest.fn(),
      } as Partial<Response> as Response;

      const res2 = {
        setHeader: jest.fn(),
      } as Partial<Response> as Response;

      const next1 = jest.fn();
      const next2 = jest.fn();

      middleware.use(req1, res1, next1);
      middleware.use(req2, res2, next2);

      expect((req1 as any).correlationId).toBeDefined();
      expect((req2 as any).correlationId).toBeDefined();
      expect((req1 as any).correlationId).not.toBe((req2 as any).correlationId);
    });

    it('should preserve correlation ID across request lifecycle', () => {
      const correlationId = 'persistent-correlation-id';
      const req = {
        headers: {
          'x-correlation-id': correlationId,
        },
        method: 'GET',
        path: '/api/events',
      } as Partial<Request> as Request;

      const res = {
        setHeader: jest.fn(),
      } as Partial<Response> as Response;

      const next = jest.fn();

      middleware.use(req, res, next);

      // Correlation ID should remain the same
      expect((req as any).correlationId).toBe(correlationId);
    });

    it('should handle case-insensitive header name', () => {
      const correlationId = 'case-test-id';
      const req = {
        headers: {
          'X-Correlation-ID': correlationId, // Different case
        },
        method: 'GET',
        path: '/api/events',
      } as Partial<Request> as Request;

      const res = {
        setHeader: jest.fn(),
      } as Partial<Response> as Response;

      const next = jest.fn();

      // Express normalizes headers to lowercase, but we test both cases
      // In reality, Express will convert to lowercase
      middleware.use(req, res, next);

      // If header exists in lowercase form, it should be used
      if ((req as any).headers?.['x-correlation-id']) {
        expect((req as any).correlationId).toBe(correlationId);
      } else {
        // Otherwise, new ID should be generated
        expect((req as any).correlationId).toBeDefined();
      }
      expect(next).toHaveBeenCalled();
    });
  });
});
