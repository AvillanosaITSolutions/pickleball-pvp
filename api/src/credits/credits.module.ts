import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { CreditLedger } from './credit-ledger.entity'
import { User } from '../users/user.entity'
import { CreditsService } from './credits.service'
import { CreditsController } from './credits.controller'

@Module({
  imports: [AuthModule, UsersModule, TypeOrmModule.forFeature([CreditLedger, User])],
  providers: [CreditsService],
  controllers: [CreditsController],
  exports: [CreditsService],
})
export class CreditsModule {}
