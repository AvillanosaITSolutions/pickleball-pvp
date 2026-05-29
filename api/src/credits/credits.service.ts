import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { CreditLedger, CreditReason } from './credit-ledger.entity'
import { User } from '../users/user.entity'

@Injectable()
export class CreditsService {
  constructor(
    @InjectRepository(CreditLedger) private readonly ledger: Repository<CreditLedger>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly ds: DataSource,
  ) {}

  // Atomically adjust the user's credit balance and write a ledger row.
  // delta can be positive (grant / purchase / refund) or negative (spend).
  async adjust(
    userId: string,
    delta: number,
    reason: CreditReason,
    metadata?: Record<string, unknown>,
  ): Promise<number> {
    if (delta === 0) throw new BadRequestException('delta cannot be 0')

    return this.ds.transaction(async (manager) => {
      // Lock the row to avoid race conditions on concurrent spends.
      const user = await manager
        .createQueryBuilder(User, 'u')
        .setLock('pessimistic_write')
        .where('u.id = :id', { id: userId })
        .getOneOrFail()

      const next = user.credits + delta
      if (next < 0) throw new BadRequestException('insufficient credits')

      user.credits = next
      await manager.save(user)
      await manager.save(CreditLedger, { userId, delta, reason, metadata })
      return next
    })
  }

  history(userId: string, limit = 50) {
    return this.ledger.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    })
  }
}
