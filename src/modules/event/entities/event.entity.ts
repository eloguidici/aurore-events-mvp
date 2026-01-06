import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('events')
@Index(['service', 'timestamp']) // Composite index for fast queries by service and time range
@Index(['timestamp']) // Index for deleteOldEvents operations (retention cleanup)
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

