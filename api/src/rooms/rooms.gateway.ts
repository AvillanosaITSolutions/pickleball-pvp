import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'

interface Player {
  id: string
  name: string
  x: number
  y: number
  z: number
  ry: number
}

interface Room {
  code: string
  players: Map<string, Player>
  photoUrl: string | null
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function newCode(): string {
  let s = ''
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return s
}

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  path: '/socket.io',
})
export class RoomsGateway implements OnGatewayDisconnect {
  @WebSocketServer() server!: Server

  private rooms = new Map<string, Room>()
  private socketRoom = new Map<string, string>() // socketId → roomCode

  private getOrCreate(code: string): Room {
    let room = this.rooms.get(code)
    if (!room) {
      room = { code, players: new Map(), photoUrl: null }
      this.rooms.set(code, room)
    }
    return room
  }

  private rosterPayload(room: Room) {
    return {
      code: room.code,
      players: [...room.players.values()],
      photoUrl: room.photoUrl,
    }
  }

  @SubscribeMessage('createRoom')
  createRoom(@ConnectedSocket() client: Socket, @MessageBody() body: { name?: string }) {
    let code = newCode()
    while (this.rooms.has(code)) code = newCode()
    return this.joinByCode(client, code, body?.name ?? 'Player')
  }

  @SubscribeMessage('joinRoom')
  joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { code: string; name?: string },
  ) {
    return this.joinByCode(client, (body?.code ?? '').toUpperCase(), body?.name ?? 'Player')
  }

  private joinByCode(client: Socket, code: string, name: string) {
    if (!code || code.length !== 6) return { ok: false, error: 'bad code' }
    // Leave any prior room first
    const prior = this.socketRoom.get(client.id)
    if (prior) this.leave(client, prior)

    const room = this.getOrCreate(code)
    const player: Player = { id: client.id, name: name.slice(0, 24), x: 0, y: 1.7, z: 5, ry: 0 }
    room.players.set(client.id, player)
    this.socketRoom.set(client.id, code)
    client.join(code)

    this.server.to(code).emit('roster', this.rosterPayload(room))
    return { ok: true, you: client.id, room: this.rosterPayload(room) }
  }

  @SubscribeMessage('pose')
  pose(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { x: number; y: number; z: number; ry: number },
  ) {
    const code = this.socketRoom.get(client.id)
    if (!code) return
    const room = this.rooms.get(code)
    const p = room?.players.get(client.id)
    if (!room || !p) return
    p.x = body.x; p.y = body.y; p.z = body.z; p.ry = body.ry
    client.to(code).emit('pose', { id: client.id, x: p.x, y: p.y, z: p.z, ry: p.ry })
  }

  @SubscribeMessage('photo')
  photo(@ConnectedSocket() client: Socket, @MessageBody() body: { url: string | null }) {
    const code = this.socketRoom.get(client.id)
    if (!code) return
    const room = this.rooms.get(code)
    if (!room) return
    // Cap to ~3MB to avoid abuse
    if (body?.url && body.url.length > 3_500_000) return
    room.photoUrl = body?.url ?? null
    this.server.to(code).emit('photo', { url: room.photoUrl, from: client.id })
  }

  handleDisconnect(client: Socket) {
    const code = this.socketRoom.get(client.id)
    if (code) this.leave(client, code)
  }

  private leave(client: Socket, code: string) {
    const room = this.rooms.get(code)
    if (room) {
      room.players.delete(client.id)
      client.leave(code)
      if (room.players.size === 0) this.rooms.delete(code)
      else this.server.to(code).emit('roster', this.rosterPayload(room))
    }
    this.socketRoom.delete(client.id)
  }
}
