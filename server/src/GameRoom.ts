import { Room, Client } from "@colyseus/core";
import { GameState, Pose, WorldSplat } from "./schema";

interface JoinOpts {
  name?: string;
  mode?: string;
}

const MAX_SPLATS = 400;

export class GameRoom extends Room<GameState> {
  maxClients = 8;

  onCreate(options: JoinOpts) {
    this.setState(new GameState());
    this.state.code = this.roomId;
    if (options?.mode) this.state.mode = options.mode;

    this.onMessage("pose", (client, p: { x: number; y: number; z: number; ry: number; kind?: string }) => {
      const pose = this.state.players.get(client.sessionId);
      if (!pose) return;
      pose.x = p.x; pose.y = p.y; pose.z = p.z; pose.ry = p.ry;
      if (p.kind) pose.kind = p.kind;
    });

    // Throws are ephemeral — broadcast to other clients, don't store.
    this.onMessage("throw", (client, spec) => {
      this.broadcast("throw", { from: client.sessionId, spec }, { except: client });
    });

    this.onMessage("worldSplat", (client, splat) => {
      const ws = new WorldSplat();
      Object.assign(ws, splat);
      this.state.splats.push(ws);
      while (this.state.splats.length > MAX_SPLATS) this.state.splats.shift();
    });

    this.onMessage("photo", (_client, p: { url: string | null }) => {
      this.state.photoUrl = p?.url ?? "";
    });
  }

  onJoin(client: Client, options: JoinOpts) {
    const pose = new Pose();
    pose.id = client.sessionId;
    pose.name = options?.name ?? "Player";
    this.state.players.set(client.sessionId, pose);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }
}
