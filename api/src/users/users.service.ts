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
    let user = await this.users.findOne({ where: { auth0Sub: payload.sub } })
    if (!user) {
      user = this.users.create({
        auth0Sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        credits: 0,
      })
      await this.users.save(user)
    }
    return user
  }

  findById(id: string) {
    return this.users.findOneByOrFail({ id })
  }
}
