import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  // Auth0 user identifier (e.g. "auth0|abcd")
  @Column({ unique: true })
  @Index()
  auth0Sub!: string

  @Column({ nullable: true })
  email?: string

  @Column({ nullable: true })
  name?: string

  @Column({ nullable: true })
  picture?: string

  // Cached credit balance. Source of truth is the sum of CreditLedger rows;
  // we keep this denormalised for fast reads. Updated via DB transaction.
  @Column({ type: 'int', default: 0 })
  credits!: number

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
