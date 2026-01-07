import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorage } from '@nestjs/throttler';

import { IpThrottlerGuard } from '../../guards/ip-throttler.guard';

describe('IpThrottlerGuard', () => {
  let guard: IpThrottlerGuard;

  const mockThrottlerStorage = {
    increment: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpThrottlerGuard,
        {
          provide: 'THROTTLER:MODULE_OPTIONS',
          useValue: {
            ttl: 60,
            limit: 10,
          },
        },
        {
          provide: ThrottlerStorage,
          useValue: mockThrottlerStorage,
        },
        Reflector,
      ],
    }).compile();

    guard = module.get<IpThrottlerGuard>(IpThrottlerGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('getTracker', () => {
    it('should return IP address from req.ip', async () => {
      const req = {
        ip: '192.168.1.1',
      };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('192.168.1.1');
    });

    it('should return IP from req.connection.remoteAddress when req.ip is not available', async () => {
      const req = {
        connection: {
          remoteAddress: '10.0.0.1',
        },
      };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('10.0.0.1');
    });

    it('should return IP from req.socket.remoteAddress when other options are not available', async () => {
      const req = {
        socket: {
          remoteAddress: '172.16.0.1',
        },
      };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('172.16.0.1');
    });

    it('should return "unknown" when no IP is available', async () => {
      const req = {};

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('unknown');
    });

    it('should prioritize req.ip over connection.remoteAddress', async () => {
      const req = {
        ip: '192.168.1.1',
        connection: {
          remoteAddress: '10.0.0.1',
        },
      };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('192.168.1.1');
    });

    it('should prioritize connection.remoteAddress over socket.remoteAddress', async () => {
      const req = {
        connection: {
          remoteAddress: '10.0.0.1',
        },
        socket: {
          remoteAddress: '172.16.0.1',
        },
      };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('10.0.0.1');
    });
  });

  describe('generateKey', () => {
    it('should generate key with IP, route, and throttler name', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            route: { path: '/api/events' },
            url: '/api/events',
          }),
        }),
      } as ExecutionContext;

      const suffix = '192.168.1.1:10';
      const name = 'default';

      const key = (guard as any).generateKey(context, suffix, name);
      expect(key).toBe('throttle:default:192.168.1.1:10:/api/events');
    });

    it('should use request.url when route.path is not available', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            url: '/api/health',
          }),
        }),
      } as ExecutionContext;

      const suffix = '192.168.1.1:10';
      const name = 'default';

      const key = (guard as any).generateKey(context, suffix, name);
      expect(key).toBe('throttle:default:192.168.1.1:10:/api/health');
    });

    it('should use "default" when neither route.path nor url is available', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
      } as ExecutionContext;

      const suffix = '192.168.1.1:10';
      const name = 'default';

      const key = (guard as any).generateKey(context, suffix, name);
      expect(key).toBe('throttle:default:192.168.1.1:10:default');
    });

    it('should prioritize route.path over url', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            route: { path: '/api/events' },
            url: '/api/different',
          }),
        }),
      } as ExecutionContext;

      const suffix = '192.168.1.1:10';
      const name = 'default';

      const key = (guard as any).generateKey(context, suffix, name);
      expect(key).toBe('throttle:default:192.168.1.1:10:/api/events');
    });

    it('should handle different throttler names', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            route: { path: '/api/events' },
          }),
        }),
      } as ExecutionContext;

      const suffix = '192.168.1.1:10';
      const name = 'strict';

      const key = (guard as any).generateKey(context, suffix, name);
      expect(key).toBe('throttle:strict:192.168.1.1:10:/api/events');
    });

    it('should generate unique keys for different IPs', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            route: { path: '/api/events' },
          }),
        }),
      } as ExecutionContext;

      const suffix1 = '192.168.1.1:10';
      const suffix2 = '192.168.1.2:10';
      const name = 'default';

      const key1 = (guard as any).generateKey(context, suffix1, name);
      const key2 = (guard as any).generateKey(context, suffix2, name);

      expect(key1).not.toBe(key2);
      expect(key1).toContain('192.168.1.1');
      expect(key2).toContain('192.168.1.2');
    });

    it('should generate unique keys for different routes', () => {
      const context1 = {
        switchToHttp: () => ({
          getRequest: () => ({
            route: { path: '/api/events' },
          }),
        }),
      } as ExecutionContext;

      const context2 = {
        switchToHttp: () => ({
          getRequest: () => ({
            route: { path: '/api/health' },
          }),
        }),
      } as ExecutionContext;

      const suffix = '192.168.1.1:10';
      const name = 'default';

      const key1 = (guard as any).generateKey(context1, suffix, name);
      const key2 = (guard as any).generateKey(context2, suffix, name);

      expect(key1).not.toBe(key2);
      expect(key1).toContain('/api/events');
      expect(key2).toContain('/api/health');
    });
  });
});

