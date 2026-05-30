import { Injectable, Logger } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import * as crypto from 'crypto'
import { CreditPack } from './packs'

/**
 * Thin PayMongo Checkout Sessions client.
 * Docs: https://developers.paymongo.com/reference/the-checkout-session-object
 */
@Injectable()
export class PaymongoService {
  private readonly log = new Logger(PaymongoService.name)
  private readonly http: AxiosInstance

  constructor() {
    const sk = process.env.PAYMONGO_SECRET_KEY
    if (!sk) this.log.warn('PAYMONGO_SECRET_KEY not set — checkout will fail')
    this.http = axios.create({
      baseURL: 'https://api.paymongo.com/v1',
      auth: { username: sk ?? '', password: '' },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15_000,
    })
  }

  async createCheckoutSession(opts: {
    pack: CreditPack
    userId: string
  }): Promise<{ id: string; checkoutUrl: string }> {
    const { pack, userId } = opts
    const body = {
      data: {
        attributes: {
          // PayMongo amounts are in centavos (1 PHP = 100)
          line_items: [
            {
              currency: 'PHP',
              amount: pack.pesos * 100,
              name: `${pack.credits.toLocaleString()} credits (${pack.label})`,
              quantity: 1,
            },
          ],
          payment_method_types: ['card', 'gcash', 'paymaya', 'grab_pay', 'qrph'],
          success_url: process.env.PAYMONGO_SUCCESS_URL,
          cancel_url: process.env.PAYMONGO_CANCEL_URL,
          description: `Wall of Anger — ${pack.label} pack`,
          // Echoed back via webhook so we can find our internal user/pack
          metadata: {
            userId,
            packId: pack.id,
            credits: String(pack.credits),
          },
        },
      },
    }

    const { data } = await this.http.post('/checkout_sessions', body)
    const id = data.data.id as string
    const checkoutUrl = data.data.attributes.checkout_url as string
    return { id, checkoutUrl }
  }

  /**
   * Verifies a PayMongo webhook signature.
   * Header format: `Paymongo-Signature: t=<timestamp>,te=<test_sig>,li=<live_sig>`
   * Signed payload: `${timestamp}.${rawBody}`
   * Algorithm: HMAC-SHA256 with the webhook signing secret.
   */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const secret = process.env.PAYMONGO_WEBHOOK_SECRET
    if (!secret || !signatureHeader) return false

    const parts = Object.fromEntries(
      signatureHeader.split(',').map((kv) => {
        const [k, v] = kv.split('=')
        return [k.trim(), v?.trim() ?? '']
      }),
    )
    const t = parts['t']
    const sig = parts['li'] || parts['te']
    if (!t || !sig) return false

    const signedPayload = `${t}.${rawBody.toString('utf8')}`
    const expected = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex')

    // Constant-time compare
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(sig, 'hex')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  }
}
