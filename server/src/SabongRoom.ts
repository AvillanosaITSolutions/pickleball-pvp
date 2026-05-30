import { Room, Client } from "@colyseus/core";
import { Schema, MapSchema, type } from "@colyseus/schema";

export class Bird extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") color = "#dc2626"; // red or blue
  @type("number") x = 0;
  @type("number") y = 0.9;
  @type("number") z = 0;
  @type("number") ry = 0;
  @type("number") hp = 100;
  @type("boolean") alive = true;
  @type("number") lastPeckAt = 0;
}

export class SabongState extends Schema {
  @type("string") code = "";
  @type("string") phase: "waiting" | "fighting" | "over" = "waiting";
  @type("string") winner = "";
  @type({ map: Bird }) birds = new MapSchema<Bird>();
}

// Yaw convention matches the client: ry such that a group with rotation.y = ry
// has its forward axis (-Z in local space) aligned with the desired world
// direction. yaw = atan2(-forwardX, -forwardZ).
//   Player1 at (-3,0,0), forward +X  → ry = atan2(-1, 0) = -π/2
//   Player2 at (+3,0,0), forward -X  → ry = atan2( 1, 0) =  π/2
const SPAWNS: Array<{ x: number; z: number; ry: number; color: string }> = [
  { x: -3, z: 0,  ry: -Math.PI / 2, color: "#dc2626" },
  { x:  3, z: 0,  ry:  Math.PI / 2, color: "#2563eb" },
];

const PECK_COOLDOWN_MS = 450;
const PECK_RANGE = 2.0;
const PECK_HALF_CONE_RAD = Math.PI / 2.5; // ~72° each side -> ~144° cone, generous
const PECK_DAMAGE = 15;

export class SabongRoom extends Room<SabongState> {
  maxClients = 2;

  onCreate() {
    this.setState(new SabongState());
    this.state.code = this.roomId;

    this.onMessage("pose", (client, p: { x: number; y: number; z: number; ry: number }) => {
      const b = this.state.birds.get(client.sessionId);
      if (!b || !b.alive) return;
      b.x = p.x; b.y = p.y; b.z = p.z; b.ry = p.ry;
    });

    this.onMessage("peck", (client) => {
      if (this.state.phase !== "fighting") return;
      const me = this.state.birds.get(client.sessionId);
      if (!me || !me.alive) return;
      const now = Date.now();
      if (now - me.lastPeckAt < PECK_COOLDOWN_MS) return;
      me.lastPeckAt = now;

      let hit: Bird | null = null;
      this.state.birds.forEach((other) => {
        if (other.id === me.id || !other.alive) return;
        const dx = other.x - me.x;
        const dz = other.z - me.z;
        const dist = Math.hypot(dx, dz);
        if (dist > PECK_RANGE) return;
        // Facing check: the angle "ry would need to be" for me to look directly
        // at `other`. Same convention as the client's yaw extraction:
        //   yaw = atan2(-forwardX, -forwardZ) — and forward from me to other
        //   is (dx, dz) normalized, so angleTo = atan2(-dx, -dz).
        const angleTo = Math.atan2(-dx, -dz);
        let delta = Math.abs(angleTo - me.ry);
        // Wrap to [0, π]
        delta = delta % (Math.PI * 2);
        if (delta > Math.PI) delta = Math.PI * 2 - delta;
        if (delta > PECK_HALF_CONE_RAD) return;
        hit = other;
      });

      if (hit) {
        const target = hit as Bird;
        target.hp = Math.max(0, target.hp - PECK_DAMAGE);
        this.broadcast("peckHit", { from: me.id, to: target.id, hp: target.hp });
        if (target.hp <= 0) {
          target.alive = false;
          this.checkWinner();
        }
      } else {
        this.broadcast("peckMiss", { from: me.id });
      }
    });
  }

  onJoin(client: Client, options: { name?: string }) {
    const spawn = SPAWNS[this.state.birds.size] ?? SPAWNS[0];
    const b = new Bird();
    b.id = client.sessionId;
    b.name = options?.name?.slice(0, 24) || "Rooster";
    b.color = spawn.color;
    b.x = spawn.x; b.z = spawn.z; b.ry = spawn.ry;
    this.state.birds.set(client.sessionId, b);

    if (this.state.birds.size === 2 && this.state.phase === "waiting") {
      // Brief countdown handled client-side; we just flip phase.
      setTimeout(() => {
        if (this.state.birds.size === 2) this.state.phase = "fighting";
      }, 2500);
    }
  }

  onLeave(client: Client) {
    const b = this.state.birds.get(client.sessionId);
    if (b) b.alive = false;
    this.state.birds.delete(client.sessionId);
    if (this.state.phase === "fighting") this.checkWinner();
  }

  private checkWinner() {
    const survivors: Bird[] = [];
    this.state.birds.forEach((b) => { if (b.alive) survivors.push(b); });
    if (survivors.length <= 1) {
      this.state.phase = "over";
      this.state.winner = survivors[0]?.id ?? "";
    }
  }
}
