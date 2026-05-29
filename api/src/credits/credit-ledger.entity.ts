import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm'

export type CreditReason = 'purchase' | 'spend' | 'grant' | 'refund'

@Entity('credit_ledger')
@Index(['userId', 'createdAt'])
export class CreditLedger {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('uuid')
  userId!: string

  // Positive = credit gained, negative = credit spent.
  @Column('int')
  delta!: number

  @Column({ type: 'varchar', length: 32 })
  reason!: CreditReason

  // Free-form context: { kind: 'tomato', packId: 'starter', txnId: '...' }
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>

  @CreateDateColumn()
  createdAt!: Date
}
