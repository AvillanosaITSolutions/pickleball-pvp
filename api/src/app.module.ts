import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { CreditsModule } from './credits/credits.module'
import { PaymentsModule } from './payments/payments.module'
import { User } from './users/user.entity'
import { CreditLedger } from './credits/credit-ledger.entity'
import { PaymentTransaction } from './payments/payment-transaction.entity'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      entities: [User, CreditLedger, PaymentTransaction],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: false,
    }),
    AuthModule,
    UsersModule,
    CreditsModule,
    PaymentsModule,
  ],
})
export class AppModule {}
