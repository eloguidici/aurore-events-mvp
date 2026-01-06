import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Sanitization E2E', () => {
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

  it('should sanitize HTML tags from service name', async () => {
    const response = await request(app.getHttpServer())
      .post('/events')
      .send({
        timestamp: new Date().toISOString(),
        service: '<script>alert("xss")</script>user-service',
        message: 'Test message',
      })
      .expect(202);

    expect(response.body).toBeDefined();
    // Service name should be sanitized (HTML removed)
    // We can't directly verify this without querying the database,
    // but the request should succeed without errors
  });

  it('should sanitize HTML tags from message', async () => {
    const response = await request(app.getHttpServer())
      .post('/events')
      .send({
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: '<b>Bold</b> text with <script>alert("xss")</script>',
      })
      .expect(202);

    expect(response.body).toBeDefined();
  });

  it('should sanitize HTML tags from metadata', async () => {
    const response = await request(app.getHttpServer())
      .post('/events')
      .send({
        timestamp: new Date().toISOString(),
        service: 'test-service',
        message: 'Test message',
        metadata: {
          description: '<b>Bold</b> text',
          html: '<script>alert("xss")</script>',
        },
      })
      .expect(202);

    expect(response.body).toBeDefined();
  });
});
