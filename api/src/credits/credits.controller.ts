import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { UsersService } from '../users/users.service'
import { CreditsService } from './credits.service'
import type { Auth0JwtPayload } from '../auth/jwt.strategy'
import { IsIn, IsInt, Min } from 'class-validator'

class SpendDto {
  @IsInt() @Min(1) amount!: number
  @IsIn([
    'tomato', 'egg', 'banana', 'cake', 'shit', 'paint', 'water',
    'rock', 'brick', 'bowlingBall', 'chair', 'tv', 'gun',
  ])
  kind!: string
}

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(
    private readonly users: UsersService,
    private readonly credits: CreditsService,
  ) {}

  @Get('balance')
  async balance(@CurrentUser() payload: Auth0JwtPayload) {
    const user = await this.users.findOrCreate(payload)
    return { credits: user.credits }
  }

  // Server-authoritative spend. The client posts intent; the server is the source of truth.
  @Post('spend')
  async spend(@CurrentUser() payload: Auth0JwtPayload, @Body() body: SpendDto) {
    const user = await this.users.findOrCreate(payload)
    const balance = await this.credits.adjust(
      user.id,
      -body.amount,
      'spend',
      { kind: body.kind },
    )
    return { credits: balance }
  }

  @Get('history')
  async history(@CurrentUser() payload: Auth0JwtPayload) {
    const user = await this.users.findOrCreate(payload)
    return this.credits.history(user.id)
  }
}
