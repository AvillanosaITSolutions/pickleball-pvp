import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { Request } from 'express'
import { IsString } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { UsersService } from '../users/users.service'
import { CreditsService } from '../credits/credits.service'
import { PaymentsService } from './payments.service'
import { PaymongoService } from './paymongo.service'
import { findPack } from './packs'
import type { Auth0JwtPayload } from '../auth/jwt.strategy'

class CheckoutDto {
  @IsString() packId!: string
}

@Controller('payments')
export class PaymentsController {
  private readonly log = new Logger(PaymentsController.name)

  constructor(
    private readonly users: UsersService,
    private readonly credits: CreditsService,
    private readonly payments: PaymentsService,
    private readonly paymongo: PaymongoService,
  ) {}

  // POST /api/payments/checkout — start a PayMongo session, return its hosted URL
  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  async checkout(@CurrentUser() payload: Auth0JwtPayload, @Body() body: CheckoutDto) {
    const pack = findPack(body.packId)
    if (!pack) throw new BadRequestException('unknown pack')

    const user = await this.users.findOrCreate(payload)
    const session = await this.paymongo.createCheckoutSession({ pack, userId: user.id })

    await this.payments.createPending({
      userId: user.id,
      paymongoSessionId: session.id,
      packId: pack.id,
      pesos: pack.pesos,
      credits: pack.credits,
    })

    return { checkoutUrl: session.checkoutUrl, sessionId: session.id }
  }

  // POST /api/payments/webhook — PayMongo posts events here
  // NOTE: server uses raw body parser on this path so signature verification works.
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request,
    @Headers('paymongo-signature') signature: string,
  ) {
    const raw = (req as Request & { body: Buffer }).body
    if (!Buffer.isBuffer(raw)) throw new BadRequestException('raw body required')

    if (!this.paymongo.verifyWebhookSignature(raw, signature)) {
      throw new UnauthorizedException('invalid signature')
    }

    const event = JSON.parse(raw.toString('utf8'))
    const type = event?.data?.attributes?.type as string
    this.log.log(`PayMongo webhook: ${type}`)

    if (type === 'checkout_session.payment.paid' || type === 'payment.paid') {
      await this.payments.handlePaid(event)
    } else if (type === 'payment.failed') {
      await this.payments.handleFailed(event)
    }
    return { received: true }
  }
}
