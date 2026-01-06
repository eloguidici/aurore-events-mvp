import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { envs } from './modules/config/envs';
import { EventModule } from './modules/event/event.module';
import { Event } from './modules/event/entities/event.entity';
import { BatchWorkerModule } from './modules/batch-worker/batch-worker.module';
import { RetentionModule } from './modules/retention/retention.module';
import { CommonModule } from './modules/common/common.module';
import { AppController } from './app.controller';
import { IpThrottlerGuard } from './modules/common/guards/ip-throttler.guard';
import { CorrelationIdMiddleware } from './modules/common/middleware/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: envs.throttleTtlMs,
        limit: envs.throttleGlobalLimit,
      },
      {
        name: 'ip',
        ttl: envs.throttleTtlMs,
        limit: envs.throttleIpLimit,
      },
    ]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: envs.dbHost,
      port: envs.dbPort,
      username: envs.dbUsername,
      password: envs.dbPassword,
      database: envs.dbDatabase,
      entities: [Event],
      synchronize: envs.dbSynchronize,
      logging: envs.dbLogging,
      extra: {
        max: envs.dbPoolMax, // Maximum number of connections in the pool
      },
    }),
    EventModule,
    BatchWorkerModule,
    RetentionModule,
    CommonModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: IpThrottlerGuard, // Use custom guard for per-IP rate limiting
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply correlation ID middleware to all routes
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
