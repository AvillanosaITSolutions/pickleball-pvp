import { Room, Client } from "@colyseus/core";
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class Bird extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") color = "#dc2626"; // red or blue
  @type("number") x = 0;
  @type("number") y = 0.9;
  @type("number") z = 0;
  @type("number") ry = 0;
  @type("number") hp = 100;
  @type("number") maxHp = 100;
  @type("boolean") alive = true;
  @type("number") lastPeckAt = 0;
  @type("number") spawnIndex = 0; // remembered across rematches
  // Loadout & buffs (Date.now() ms timestamps)
  @type("string") weapon = "beak";
  @type("number") weaponAmmo = -1; // -1 = unlimited
  @type("number") dmgMulUntil = 0;
  @type("number") hasteUntil = 0;
  @type("number") regenUntil = 0;
  @type("number") immortalUntil = 0;
}

export class ItemDrop extends Schema {
  @type("string") id = "";
  @type("string") kind = "";
  @type("number") x = 0;
  @type("number") z = 0;
}

export class SabongState extends Schema {
  @type("string") code = "";
  @type("string") phase: "waiting" | "fighting" | "over" = "waiting";
  @type("string") winner = "";
  @type({ map: Bird }) birds = new MapSchema<Bird>();
  @type({ map: ItemDrop }) items = new MapSchema<ItemDrop>();
  @type(["string"]) rematchReady = new ArraySchema<string>();
}

// Yaw convention matches the client: ry such that a group with rotation.y = ry
// has its forward axis (-Z in local space) aligned with the desired world
// direction. yaw = atan2(-forwardX, -forwardZ).
//   Player1 at (-3,0,0), forward +X  → ry = atan2(-1, 0) = -π/2
//   Player2 at (+3,0,0), forward -X  → ry = atan2( 1, 0) =  π/2
const SPAWNS: Array<{ x: number; z: number; ry: number; color: string }> = [
  { x: -5, z: 0,  ry: -Math.PI / 2, color: "#dc2626" },
  { x:  5, z: 0,  ry:  Math.PI / 2, color: "#2563eb" },
];

// Arena radius (server-authoritative items spawn inside this; client matches).
const ARENA_R = 10;

// Weapons table. ammo=-1 means unlimited. Ranged uses straight-line raycast;
// melee uses cone-in-front check. Cooldowns intentionally vary so the choice
// between weapons matters (slow + heavy vs fast + light).
interface WeaponSpec {
  ranged: boolean;
  damage: number;
  range: number;
  halfCone?: number; // melee only
  ammo: number;     // -1 = infinite
  cooldownMs: number;
}
const WEAPONS: Record<string, WeaponSpec> = {
  beak:      { ranged: false, damage: 15, range: 2.0,  halfCone: Math.PI / 2.5, ammo: -1, cooldownMs: 450 },
  spear:     { ranged: false, damage: 28, range: 2.9,  halfCone: Math.PI / 3,   ammo: 8,  cooldownMs: 600 },
  slingshot: { ranged: true,  damage: 14, range: 14,   ammo: 6,  cooldownMs: 350 },
  lightning: { ranged: true,  damage: 35, range: 18,   ammo: 2,  cooldownMs: 900 },
};

// Drop table — weighted; "kind" maps to either a weapon name (above) or a power-up.
const DROP_TABLE: Array<{ kind: string; weight: number }> = [
  { kind: "spear",        weight: 18 },
  { kind: "slingshot",    weight: 16 },
  { kind: "lightning",    weight: 6  },
  { kind: "doubleDamage", weight: 14 },
  { kind: "haste",        weight: 14 },
  { kind: "regen",        weight: 10 },
  { kind: "heal",         weight: 14 },
  { kind: "immortal",     weight: 5  },
];
const EFFECT_DUR_MS: Record<string, number> = {
  doubleDamage: 15000,
  haste:        15000,
  regen:        20000,
  immortal:     10000,
};
const DROP_INTERVAL_MS = 8000;
const MAX_ACTIVE_ITEMS = 5;
const PICKUP_RADIUS = 1.6;
const HIT_RADIUS = 0.6; // ranged ray vs bird capsule (approx as a 0.6m radius column)

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
      this.handleMelee(client);
    });

    this.onMessage("shoot", (client, p: { dx: number; dz: number }) => {
      this.handleShoot(client, p);
    });

    this.onMessage("pickup", (client, p: { id: string }) => {
      this.handlePickup(client, p?.id);
    });

    this.onMessage("rematch", (client) => {
      if (this.state.phase !== "over") return;
      if (this.state.rematchReady.includes(client.sessionId)) return;
      this.state.rematchReady.push(client.sessionId);
      if (this.state.rematchReady.length >= this.state.birds.size && this.state.birds.size >= 2) {
        this.resetMatch();
      }
    });

    // Sim tick: regen + item drops. 1Hz is plenty.
    this.setSimulationInterval(() => this.tick(), 1000);
  }

  private lastDropAt = 0;

  private tick() {
    const now = Date.now();
    // Regen (only while fighting)
    if (this.state.phase === "fighting") {
      this.state.birds.forEach((b) => {
        if (!b.alive) return;
        if (b.regenUntil > now) {
          b.hp = Math.min(b.maxHp, b.hp + 3);
        }
      });
    }
    // Drop spawner — only during a live match, capped by MAX_ACTIVE_ITEMS.
    if (this.state.phase === "fighting" && now - this.lastDropAt >= DROP_INTERVAL_MS) {
      if (this.state.items.size < MAX_ACTIVE_ITEMS) {
        this.spawnDrop();
        this.lastDropAt = now;
      }
    }
  }

  private spawnDrop() {
    const total = DROP_TABLE.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    let kind = DROP_TABLE[0].kind;
    for (const e of DROP_TABLE) {
      r -= e.weight;
      if (r <= 0) { kind = e.kind; break; }
    }
    // Random point inside arena, but at least 2m away from any bird so it isn't
    // an instant-grab right under someone's feet.
    let x = 0, z = 0, tries = 0;
    while (tries++ < 12) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * (ARENA_R - 1.2);
      x = Math.cos(a) * rr;
      z = Math.sin(a) * rr;
      let tooClose = false;
      this.state.birds.forEach((b) => {
        if (Math.hypot(b.x - x, b.z - z) < 2) tooClose = true;
      });
      if (!tooClose) break;
    }
    const id = `i${this.dropCounter++}`;
    const drop = new ItemDrop();
    drop.id = id; drop.kind = kind; drop.x = x; drop.z = z;
    this.state.items.set(id, drop);
  }

  private dropCounter = 0;

  private handleMelee(client: Client) {
    if (this.state.phase !== "fighting") return;
    const me = this.state.birds.get(client.sessionId);
    if (!me || !me.alive) return;
    const w = WEAPONS[me.weapon] ?? WEAPONS.beak;
    if (w.ranged) return; // wrong message type for this weapon
    const now = Date.now();
    if (now - me.lastPeckAt < w.cooldownMs) return;
    me.lastPeckAt = now;

    const halfCone = w.halfCone ?? Math.PI / 3;
    let hit: Bird | null = null;
    this.state.birds.forEach((other) => {
      if (other.id === me.id || !other.alive) return;
      const dx = other.x - me.x;
      const dz = other.z - me.z;
      const dist = Math.hypot(dx, dz);
      if (dist > w.range) return;
      const angleTo = Math.atan2(-dx, -dz);
      let delta = Math.abs(angleTo - me.ry) % (Math.PI * 2);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      if (delta > halfCone) return;
      hit = other;
    });

    if (hit) {
      const target = hit as Bird;
      if (target.immortalUntil > now) {
        // Hit registered but no damage — still tell clients so the impact effect plays.
        this.broadcast("peckHit", { from: me.id, to: target.id, hp: target.hp, weapon: me.weapon, blocked: true });
      } else {
        const dmg = w.damage * (me.dmgMulUntil > now ? 2 : 1);
        target.hp = Math.max(0, target.hp - dmg);
        this.broadcast("peckHit", { from: me.id, to: target.id, hp: target.hp, weapon: me.weapon });
        if (target.hp <= 0) { target.alive = false; this.checkWinner(); }
      }
    } else {
      this.broadcast("peckMiss", { from: me.id, weapon: me.weapon });
    }
    this.consumeAmmo(me);
  }

  private handleShoot(client: Client, p: { dx: number; dz: number }) {
    if (this.state.phase !== "fighting") return;
    const me = this.state.birds.get(client.sessionId);
    if (!me || !me.alive) return;
    const w = WEAPONS[me.weapon] ?? WEAPONS.beak;
    if (!w.ranged) return;
    const now = Date.now();
    if (now - me.lastPeckAt < w.cooldownMs) return;
    me.lastPeckAt = now;
    // Normalize aim
    const n = Math.hypot(p.dx, p.dz) || 1;
    const ax = p.dx / n, az = p.dz / n;

    // Ray from me, find closest opponent hit within range.
    let best: { other: Bird; t: number } | null = null;
    this.state.birds.forEach((other) => {
      if (other.id === me.id || !other.alive) return;
      const ox = other.x - me.x;
      const oz = other.z - me.z;
      const t = ox * ax + oz * az;
      if (t < 0 || t > w.range) return;
      const px = ox - t * ax, pz = oz - t * az;
      const perp = Math.hypot(px, pz);
      if (perp > HIT_RADIUS) return;
      if (!best || t < best.t) best = { other: other as Bird, t } as { other: Bird; t: number };
    });

    const endT = best ? best.t : w.range;
    const ex = me.x + ax * endT;
    const ez = me.z + az * endT;
    if (best) {
      const target = (best as { other: Bird }).other;
      if (target.immortalUntil > now) {
        this.broadcast("shotHit", { from: me.id, to: target.id, hp: target.hp, weapon: me.weapon, ex, ez, blocked: true });
      } else {
        const dmg = w.damage * (me.dmgMulUntil > now ? 2 : 1);
        target.hp = Math.max(0, target.hp - dmg);
        this.broadcast("shotHit", { from: me.id, to: target.id, hp: target.hp, weapon: me.weapon, ex, ez });
        if (target.hp <= 0) { target.alive = false; this.checkWinner(); }
      }
    } else {
      this.broadcast("shotMiss", { from: me.id, weapon: me.weapon, ex, ez });
    }
    this.consumeAmmo(me);
  }

  private consumeAmmo(me: Bird) {
    const w = WEAPONS[me.weapon] ?? WEAPONS.beak;
    if (w.ammo < 0) return;
    me.weaponAmmo -= 1;
    if (me.weaponAmmo <= 0) { me.weapon = "beak"; me.weaponAmmo = -1; }
  }

  private handlePickup(client: Client, itemId: string) {
    if (this.state.phase !== "fighting") return;
    const me = this.state.birds.get(client.sessionId);
    if (!me || !me.alive) return;
    const item = this.state.items.get(itemId);
    if (!item) return;
    if (Math.hypot(item.x - me.x, item.z - me.z) > PICKUP_RADIUS) return;
    this.applyItem(me, item.kind);
    this.state.items.delete(itemId);
    this.broadcast("pickup", { by: me.id, kind: item.kind });
  }

  private applyItem(me: Bird, kind: string) {
    const now = Date.now();
    if (WEAPONS[kind]) {
      me.weapon = kind;
      me.weaponAmmo = WEAPONS[kind].ammo;
      return;
    }
    switch (kind) {
      case "doubleDamage": me.dmgMulUntil   = Math.max(me.dmgMulUntil,   now + EFFECT_DUR_MS.doubleDamage); break;
      case "haste":        me.hasteUntil    = Math.max(me.hasteUntil,    now + EFFECT_DUR_MS.haste);        break;
      case "regen":        me.regenUntil    = Math.max(me.regenUntil,    now + EFFECT_DUR_MS.regen);        break;
      case "immortal":     me.immortalUntil = Math.max(me.immortalUntil, now + EFFECT_DUR_MS.immortal);     break;
      case "heal":         me.hp = Math.min(me.maxHp, me.hp + 40); break;
    }
  }

  onJoin(client: Client, options: { name?: string }) {
    const slot = this.state.birds.size;
    const spawn = SPAWNS[slot] ?? SPAWNS[0];
    const b = new Bird();
    b.id = client.sessionId;
    b.name = options?.name?.slice(0, 24) || "Rooster";
    b.color = spawn.color;
    b.spawnIndex = slot;
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

  private resetMatch() {
    this.state.winner = "";
    this.state.phase = "waiting";
    while (this.state.rematchReady.length > 0) this.state.rematchReady.pop();
    // Wipe items so the next match starts clean.
    const ids: string[] = [];
    this.state.items.forEach((_, id) => ids.push(id));
    ids.forEach((id) => this.state.items.delete(id));
    this.lastDropAt = Date.now(); // first drop ~DROP_INTERVAL_MS into the match
    this.state.birds.forEach((b) => {
      const spawn = SPAWNS[b.spawnIndex] ?? SPAWNS[0];
      b.x = spawn.x;
      b.y = 0.9;
      b.z = spawn.z;
      b.ry = spawn.ry;
      b.hp = 100;
      b.maxHp = 100;
      b.alive = true;
      b.lastPeckAt = 0;
      b.weapon = "beak";
      b.weaponAmmo = -1;
      b.dmgMulUntil = 0;
      b.hasteUntil = 0;
      b.regenUntil = 0;
      b.immortalUntil = 0;
    });
    setTimeout(() => {
      if (this.state.birds.size >= 2 && this.state.phase === "waiting") {
        this.state.phase = "fighting";
      }
    }, 2500);
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
