import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PaymentTransaction } from './payment-transaction.entity'
import { CreditsService } from '../credits/credits.service'

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name)

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly txns: Repository<PaymentTransaction>,
    private readonly credits: CreditsService,
  ) {}

  async createPending(input: {
    userId: string
    paymongoSessionId: string
    packId: string
    pesos: number
    credits: number
  }) {
    const t = this.txns.create({ ...input, status: 'pending' })
    return this.txns.save(t)
  }

  async handlePaid(event: any) {
    // Find our internal txn by the PayMongo session id echoed in metadata or referenced data
    const sessionId: string | undefined =
      event?.data?.attributes?.data?.id ??
      event?.data?.attributes?.metadata?.session_id

    const metadataUserId =
      event?.data?.attributes?.data?.attributes?.metadata?.userId

    let txn = sessionId
      ? await this.txns.findOne({ where: { paymongoSessionId: sessionId } })
      : null
    if (!txn && metadataUserId) {
      // fallback: latest pending for this user
      txn = await this.txns.findOne({
        where: { userId: metadataUserId, status: 'pending' },
        order: { createdAt: 'DESC' },
      })
    }
    if (!txn) {
      this.log.warn('Paid event with no matching transaction — ignoring')
      return
    }
    if (txn.status === 'paid') {
      this.log.log(`Duplicate paid event for ${txn.id} — already credited`)
      return
    }

    txn.status = 'paid'
    txn.rawWebhookPayload = event
    await this.txns.save(txn)

    await this.credits.adjust(txn.userId, txn.credits, 'purchase', {
      packId: txn.packId,
      txnId: txn.id,
    })

    this.log.log(
      `Credited user=${txn.userId} +${txn.credits} (₱${txn.pesos}, pack=${txn.packId})`,
    )
  }

  async handleFailed(event: any) {
    const sessionId =
      event?.data?.attributes?.data?.id ??
      event?.data?.attributes?.metadata?.session_id
    if (!sessionId) return
    const txn = await this.txns.findOne({ where: { paymongoSessionId: sessionId } })
    if (!txn) return
    txn.status = 'failed'
    txn.rawWebhookPayload = event
    await this.txns.save(txn)
  }
}
