import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // Time window in milliseconds (1 minute)
        limit: 300000, // Maximum number of requests per window (5,000 events/second)
      },
    ]),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: envs.databasePath,
      entities: [Event],
      synchronize: envs.dbSynchronize,
      logging: envs.dbLogging,
      extra: {
        // Enable WAL (Write-Ahead Logging) mode for better concurrency
        // Allows multiple readers while one writer, improves performance
        enableWAL: true,
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
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

