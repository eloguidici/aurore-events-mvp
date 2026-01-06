import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Event } from '../src/modules/event/entities/event.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/**
 * Script to clear all events from the database
 * 
 * Usage:
 *   npm run clear-db
 *   or
 *   ts-node scripts/clear-database.ts
 */
async function clearDatabase() {
  const logger = new Logger('ClearDatabase');
  
  try {
    logger.log('🚀 Starting database cleanup...');
    
    // Create NestJS application context
    const app = await NestFactory.createApplicationContext(AppModule);
    
    // Get Event repository
    const eventRepository = app.get<Repository<Event>>(
      getRepositoryToken(Event),
    );
    
    // Count events before deletion
    const countBefore = await eventRepository.count();
    logger.log(`📊 Found ${countBefore} events in database`);
    
    if (countBefore === 0) {
      logger.log('✅ Database is already empty');
      await app.close();
      return;
    }
    
    // Delete all events
    logger.log('🗑️  Deleting all events...');
    const result = await eventRepository
      .createQueryBuilder()
      .delete()
      .from(Event)
      .execute();
    
    const deletedCount = result.affected || 0;
    logger.log(`✅ Successfully deleted ${deletedCount} events`);
    
    // Verify deletion
    const countAfter = await eventRepository.count();
    if (countAfter === 0) {
      logger.log('✅ Database cleared successfully');
    } else {
      logger.warn(`⚠️  Warning: ${countAfter} events still remain`);
    }
    
    await app.close();
    logger.log('✨ Done!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error clearing database:', error);
    process.exit(1);
  }
}

clearDatabase();

