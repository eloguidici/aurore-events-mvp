import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Dead Letter Queue (DLQ) entity
 * Stores events that permanently failed after all retry attempts
 */
@Entity('dead_letter_queue')
@Index(['eventId'], { unique: true })
@Index(['service'])
@Index(['createdAt'])
@Index(['reprocessed', 'createdAt'])
export class DeadLetterEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  eventId: string;

  @Column({ type: 'jsonb' })
  originalEvent: Record<string, any>; // Store the original enriched event as JSONB

  @Column({ type: 'text' })
  failureReason: string; // Reason why event failed permanently

  @Column({ type: 'integer', default: 0 })
  retryCount: number; // Number of retry attempts made before giving up

  @Column({ type: 'timestamp' })
  lastAttemptAt: Date; // Timestamp of last retry attempt

  @Column({ type: 'boolean', default: false })
  reprocessed: boolean; // Whether event has been manually reprocessed

  @Column({ type: 'timestamp', nullable: true })
  reprocessedAt: Date | null; // Timestamp when event was reprocessed

  @Column({ type: 'varchar', length: 100, nullable: true })
  service: string | null; // Service name for easier filtering

  @Column({ type: 'timestamp', nullable: true })
  originalTimestamp: Date | null; // Original event timestamp

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
