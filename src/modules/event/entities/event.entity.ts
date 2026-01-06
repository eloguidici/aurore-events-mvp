import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('events')
@Index(['service', 'timestamp']) // Composite index for fast queries by service and time range
@Index(['service', 'createdAt']) // Composite index for business metrics queries by service
@Index(['timestamp']) // Index for deleteOldEvents operations (retention cleanup)
@Index(['createdAt']) // Index for business metrics queries
@Index(['eventId']) // Index for eventId lookups
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  eventId: string;

  @Column({ type: 'text' })
  timestamp: string;

  @Column({ type: 'varchar', length: 100 })
  service: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', nullable: true })
  metadataJson: string | null;

  @Column({ type: 'text' })
  ingestedAt: string;

  @CreateDateColumn()
  createdAt: Date;
}
