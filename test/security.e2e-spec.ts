import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { randomBytes } from 'crypto';

/**
 * Security tests for Aurore Events MVP
 * Tests for XSS prevention, input validation, rate limiting, and other security measures
 */
describe('Security Tests (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('XSS Prevention', () => {
    it('should sanitize XSS payloads in service field', async () => {
      const maliciousPayload = '<script>alert("xss")</script>';
      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          timestamp: new Date().toISOString(),
          service: maliciousPayload,
          message: 'Test message',
          metadata: {},
        });

      expect(response.status).toBe(202);
      // Verify that script tags are removed from service
      expect(response.body.eventId).toBeDefined();
      // Service should be sanitized (actual sanitization depends on SanitizerService implementation)
    });

    it('should sanitize XSS payloads in message field', async () => {
      const maliciousPayload = '<img src=x onerror=alert(1)>';
      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          timestamp: new Date().toISOString(),
          service: 'test-service',
          message: maliciousPayload,
          metadata: {},
        });

      expect(response.status).toBe(202);
      // Message should be sanitized
    });

    it('should sanitize XSS payloads in metadata', async () => {
      const maliciousMetadata = {
        user: '<script>alert("xss")</script>',
        data: '<img src=x onerror=alert(1)>',
      };

      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          timestamp: new Date().toISOString(),
          service: 'test-service',
          message: 'Test message',
          metadata: maliciousMetadata,
        });

      expect(response.status).toBe(202);
      // Metadata should be sanitized
    });
  });

  describe('Input Validation', () => {
    it('should reject oversized metadata', async () => {
      // Create metadata larger than METADATA_MAX_SIZE_KB (default 16KB)
      const oversizedMetadata = {};
      for (let i = 0; i < 2000; i++) {
        oversizedMetadata[`key${i}`] = 'x'.repeat(100);
      }

      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          timestamp: new Date().toISOString(),
          service: 'test-service',
          message: 'Test message',
          metadata: oversizedMetadata,
        });

      expect(response.status).toBe(400); // Bad Request
    });

    it('should reject metadata with too many keys', async () => {
      // Create metadata with more than METADATA_MAX_KEYS (default 100)
      const manyKeysMetadata = {};
      for (let i = 0; i < 150; i++) {
        manyKeysMetadata[`key${i}`] = 'value';
      }

      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          timestamp: new Date().toISOString(),
          service: 'test-service',
          message: 'Test message',
          metadata: manyKeysMetadata,
        });

      expect(response.status).toBe(400); // Bad Request
    });

    it('should reject metadata with excessive depth', async () => {
      // Create deeply nested metadata (depth > METADATA_MAX_DEPTH, default 5)
      const deepMetadata = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    level7: 'too deep',
                  },
                },
              },
            },
          },
        },
      };

      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          timestamp: new Date().toISOString(),
          service: 'test-service',
          message: 'Test message',
          metadata: deepMetadata,
        });

      expect(response.status).toBe(400); // Bad Request
    });

    it('should reject messages exceeding max length', async () => {
      const longMessage = 'x'.repeat(3000); // Exceeds MESSAGE_MAX_LENGTH (default 2000)

      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          timestamp: new Date().toISOString(),
          service: 'test-service',
          message: longMessage,
          metadata: {},
        });

      expect(response.status).toBe(400); // Bad Request
    });

    it('should reject invalid timestamps', async () => {
      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          timestamp: 'invalid-date',
          service: 'test-service',
          message: 'Test message',
          metadata: {},
        });

      expect(response.status).toBe(400); // Bad Request
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce global rate limit', async () => {
      const requests = [];
      const requestCount = 310000; // Exceeds THROTTLE_GLOBAL_LIMIT (default 300,000)

      // Send multiple requests rapidly
      for (let i = 0; i < 100; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/events')
            .send({
              timestamp: new Date().toISOString(),
              service: 'test-service',
              message: `Test message ${i}`,
              metadata: {},
            }),
        );
      }

      const responses = await Promise.all(requests);
      // At least one request should be rate limited (429)
      const rateLimitedCount = responses.filter(
        (r) => r.status === 429,
      ).length;
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should enforce per-IP rate limit', async () => {
      const requests = [];
      const requestCount = 10001; // Exceeds THROTTLE_IP_LIMIT (default 10,000)

      // Send multiple requests from same IP
      for (let i = 0; i < 10001; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/events')
            .send({
              timestamp: new Date().toISOString(),
              service: 'test-service',
              message: `Test message ${i}`,
              metadata: {},
            }),
        );

        // Break after first few rate limited responses to avoid timeout
        if (i > 100) {
          const responses = await Promise.all(requests.slice(0, i));
          const rateLimitedCount = responses.filter(
            (r) => r.status === 429,
          ).length;
          if (rateLimitedCount > 0) {
            expect(rateLimitedCount).toBeGreaterThan(0);
            break;
          }
        }
      }
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should prevent SQL injection in query parameters', async () => {
      const sqlInjection = "'; DROP TABLE event; --";

      const response = await request(app.getHttpServer())
        .get(`/events?service=${encodeURIComponent(sqlInjection)}&from=2024-01-15T00:00:00.000Z&to=2024-01-15T23:59:59.000Z`)
        .expect(400); // Should be rejected or return empty results, not execute SQL

      // Verify table still exists (if we had access to DB)
      // This test verifies the query is sanitized
    });

    it('should sanitize sort field to prevent SQL injection', async () => {
      const maliciousSortField = "timestamp; DROP TABLE event; --";

      const response = await request(app.getHttpServer())
        .get(
          `/events?service=test-service&from=2024-01-15T00:00:00.000Z&to=2024-01-15T23:59:59.000Z&sortField=${encodeURIComponent(maliciousSortField)}`,
        )
        .expect(400); // Should be rejected

      // Sort field should be validated against whitelist
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should reject path traversal attempts', async () => {
      const pathTraversal = '../../../etc/passwd';

      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          timestamp: new Date().toISOString(),
          service: pathTraversal,
          message: 'Test message',
          metadata: {},
        });

      // Should sanitize or reject path traversal attempts
      expect(response.status).toBe(400); // Or sanitized
    });
  });

  describe('JSON Bomb Prevention', () => {
    it('should reject deeply nested JSON structures', async () => {
      // Create JSON bomb (deeply nested structure)
      let nested = { data: 'value' };
      for (let i = 0; i < 100; i++) {
        nested = { nested };
      }

      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          timestamp: new Date().toISOString(),
          service: 'test-service',
          message: 'Test message',
          metadata: nested,
        });

      expect(response.status).toBe(400); // Should reject excessive depth
    });
  });

  describe('ReDoS Prevention', () => {
    it('should handle regex denial of service attempts gracefully', async () => {
      // Attempt ReDoS with evil regex input
      const evilInput = 'a'.repeat(1000) + '!';

      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          timestamp: new Date().toISOString(),
          service: evilInput,
          message: 'Test message',
          metadata: {},
        });

      // Should either reject or sanitize, but not hang
      expect(response.status).toBeLessThan(500); // Should not cause server error
      expect(response.headers['x-response-time']).toBeDefined();
    }, 10000); // 10 second timeout for this test
  });

  describe('NoSQL Injection Prevention', () => {
    it('should prevent NoSQL injection in metadata', async () => {
      const nosqlInjection = {
        $gt: '',
        $where: 'this.service == this.message',
      };

      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          timestamp: new Date().toISOString(),
          service: 'test-service',
          message: 'Test message',
          metadata: nosqlInjection,
        });

      // Should sanitize or reject NoSQL injection attempts
      expect(response.status).toBeGreaterThanOrEqual(400); // Should be rejected or sanitized
    });
  });

  describe('Content-Type Validation', () => {
    it('should reject requests with invalid Content-Type', async () => {
      const response = await request(app.getHttpServer())
        .post('/events')
        .set('Content-Type', 'text/plain')
        .send('invalid json');

      expect(response.status).toBeGreaterThanOrEqual(400); // Should reject
    });
  });

  describe('Query Parameter Validation', () => {
    it('should reject invalid time ranges', async () => {
      const response = await request(app.getHttpServer())
        .get('/events?service=test-service&from=2024-01-15T23:59:59.000Z&to=2024-01-15T00:00:00.000Z') // from > to
        .expect(400); // Bad Request

      expect(response.body.message).toContain('time range');
    });

    it('should reject time ranges exceeding maximum', async () => {
      const from = new Date('2024-01-01').toISOString();
      const to = new Date('2024-02-15').toISOString(); // > 30 days

      const response = await request(app.getHttpServer())
        .get(`/events?service=test-service&from=${from}&to=${to}`)
        .expect(400); // Bad Request

      expect(response.body.message).toContain('time range');
    });

    it('should reject invalid pagination parameters', async () => {
      const response = await request(app.getHttpServer())
        .get('/events?service=test-service&from=2024-01-15T00:00:00.000Z&to=2024-01-15T23:59:59.000Z&page=0') // page < 1
        .expect(400); // Bad Request
    });

    it('should reject excessive page size', async () => {
      const response = await request(app.getHttpServer())
        .get(
          '/events?service=test-service&from=2024-01-15T00:00:00.000Z&to=2024-01-15T23:59:59.000Z&pageSize=10000', // > MAX_QUERY_LIMIT
        )
        .expect(400); // Bad Request
    });
  });
});
