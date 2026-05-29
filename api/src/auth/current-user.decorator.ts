import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { Auth0JwtPayload } from './jwt.strategy'

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Auth0JwtPayload => {
    return ctx.switchToHttp().getRequest().user
  },
)
