import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded'

@Entity('payment_transactions')
@Index(['userId', 'createdAt'])
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('uuid')
  userId!: string

  // The PayMongo Checkout Session id (we use Checkout Sessions, not Payment Intents directly).
  @Column({ unique: true })
  @Index()
  paymongoSessionId!: string

  @Column({ type: 'varchar', length: 32 })
  packId!: string

  @Column('int')
  pesos!: number

  @Column('int')
  credits!: number

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: PaymentStatus

  @Column({ type: 'jsonb', nullable: true })
  rawWebhookPayload?: Record<string, unknown>

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
