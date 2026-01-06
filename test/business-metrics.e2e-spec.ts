import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Business Metrics E2E', () => {
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

  it('should return business metrics', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/business')
      .expect(200);

    expect(response.body).toBeDefined();
    expect(response.body).toHaveProperty('totalEvents');
    expect(response.body).toHaveProperty('eventsByService');
    expect(response.body).toHaveProperty('eventsLast24Hours');
    expect(response.body).toHaveProperty('eventsLastHour');
    expect(response.body).toHaveProperty('averageEventsPerMinute');
    expect(response.body).toHaveProperty('topServices');
    expect(response.body).toHaveProperty('eventsByHour');

    // Verify types
    expect(typeof response.body.totalEvents).toBe('number');
    expect(typeof response.body.eventsByService).toBe('object');
    expect(typeof response.body.eventsLast24Hours).toBe('number');
    expect(typeof response.body.eventsLastHour).toBe('number');
    expect(typeof response.body.averageEventsPerMinute).toBe('number');
    expect(Array.isArray(response.body.topServices)).toBe(true);
    expect(Array.isArray(response.body.eventsByHour)).toBe(true);
  });

  it('should include correlation ID in response', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/business')
      .expect(200);

    expect(response.headers['x-correlation-id']).toBeDefined();
  });
});
