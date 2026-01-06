import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Correlation ID E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should generate correlation ID when not provided', async () => {
    const response = await request(app.getHttpServer())
      .post('/events')
      .send({
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
      })
      .expect(202);

    expect(response.headers['x-correlation-id']).toBeDefined();
    expect(response.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('should use provided correlation ID', async () => {
    const customCorrelationId = 'custom-correlation-id-12345';

    const response = await request(app.getHttpServer())
      .post('/events')
      .set('X-Correlation-Id', customCorrelationId)
      .send({
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
      })
      .expect(202);

    expect(response.headers['x-correlation-id']).toBe(customCorrelationId);
  });

  it('should include correlation ID in all endpoints', async () => {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(response.headers['x-correlation-id']).toBeDefined();
  });
});
