import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { UsersService } from './users.service'
import type { Auth0JwtPayload } from '../auth/jwt.strategy'

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // GET /api/users/me — provisions the user on first call, returns profile + balance
  @Get('me')
  async me(@CurrentUser() payload: Auth0JwtPayload) {
    const user = await this.users.findOrCreate(payload)
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      credits: user.credits,
    }
  }
}
