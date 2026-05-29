import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './user.entity'
import type { Auth0JwtPayload } from '../auth/jwt.strategy'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async findOrCreate(payload: Auth0JwtPayload): Promise<User> {
    const email = payload['https://rageroom/email'] ?? payload.email
    const name = payload['https://rageroom/name'] ?? payload.name
    const picture = payload['https://rageroom/picture'] ?? payload.picture

    let user = await this.users.findOne({ where: { auth0Sub: payload.sub } })
    if (!user) {
      user = this.users.create({
        auth0Sub: payload.sub,
        email,
        name,
        picture,
        credits: 0,
      })
      await this.users.save(user)
      return user
    }

    // Backfill profile if it was missing (existing user from before Action was added)
    let changed = false
    if (!user.email && email) { user.email = email; changed = true }
    if (!user.name && name) { user.name = name; changed = true }
    if (!user.picture && picture) { user.picture = picture; changed = true }
    if (changed) await this.users.save(user)

    return user
  }

  findById(id: string) {
    return this.users.findOneByOrFail({ id })
  }
}
