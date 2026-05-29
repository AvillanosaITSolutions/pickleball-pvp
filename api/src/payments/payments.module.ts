import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { CreditsModule } from '../credits/credits.module'
import { PaymentTransaction } from './payment-transaction.entity'
import { PaymentsService } from './payments.service'
import { PaymentsController } from './payments.controller'
import { PaymongoService } from './paymongo.service'

@Module({
  imports: [
    AuthModule,
    UsersModule,
    CreditsModule,
    TypeOrmModule.forFeature([PaymentTransaction]),
  ],
  providers: [PaymentsService, PaymongoService],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
