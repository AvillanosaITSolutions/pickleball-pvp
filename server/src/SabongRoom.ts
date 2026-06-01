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
  // Bot bookkeeping (server-only AI). isBot flips the client renderer to
  // show a bot badge on the nametag; everything else (movement, combat) flows
  // through the same Bird state as human players.
  @type("boolean") isBot = false;
  @type("string") botDifficulty = ""; // "easy" | "normal" | "hard" — empty for humans
  // Loadout & buffs (Date.now() ms timestamps)
  @type("string") weapon = "beak";
  @type("number") weaponAmmo = -1; // -1 = unlimited
  @type("number") dmgMulUntil = 0;
  @type("number") hasteUntil = 0;
  @type("number") regenUntil = 0;
  @type("number") immortalUntil = 0;
  @type("number") portalCooldownUntil = 0;
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
  // Order in which birds were eliminated this match. Used by the client to
  // compute placement on the defeat screen ("Finished #4 of 8"). The winner
  // is *not* in this list — they survived. Reset at the start of each match.
  @type(["string"]) eliminationOrder = new ArraySchema<string>();
  // Total players who took part in this match. Frozen at fight start so the
  // "X of Y" label doesn't shift when a defeated player closes their tab.
  @type("number") matchSize = 0;
}

// Yaw convention matches the client: ry such that a group with rotation.y = ry
// has its forward axis (-Z in local space) aligned with the desired world
// direction. yaw = atan2(-forwardX, -forwardZ).
//   Player1 at (-3,0,0), forward +X  → ry = atan2(-1, 0) = -π/2
//   Player2 at (+3,0,0), forward -X  → ry = atan2( 1, 0) =  π/2
// Royale mode supports up to 10 birds. We spawn them on a ring inside the
// arena, evenly spaced, each facing the centre. Colors are picked from a
// distinct palette so badges / minimap dots read cleanly even at 10.
const ROYALE_MAX = 10;
const SPAWN_RING_R = 10;
const ROYALE_COLORS = [
  "#dc2626", // red
  "#2563eb", // blue
  "#16a34a", // green
  "#facc15", // yellow
  "#a855f7", // purple
  "#fb923c", // orange
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
  "#f5f5f5", // bone-white
];
// Forward axis convention (matches existing client / pose code):
//   ry = atan2(-forwardX, -forwardZ)
// For an inward-facing bird at (x, z) on a ring of radius r:
//   forward = (-x/r, -z/r)  →  ry = atan2(x/r, z/r) = atan2(x, z)
const SPAWNS: Array<{ x: number; z: number; ry: number; color: string }> = ROYALE_COLORS.map((color, i) => {
  const a = (i / ROYALE_COLORS.length) * Math.PI * 2;
  const x = Math.cos(a) * SPAWN_RING_R;
  const z = Math.sin(a) * SPAWN_RING_R;
  const ry = Math.atan2(x, z);
  return { x, z, ry, color };
});

// Arena radius (server-authoritative items spawn inside this; client matches).
const ARENA_R = 14;
const PORTAL_RADIUS = 1.0;
const PORTAL_COOLDOWN_MS = 1200;
const PORTAL_POINTS = [
  { x: 12, z: 0 },
  { x: -12, z: 0 },
  { x: 0, z: 12 },
  { x: 0, z: -12 },
];

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

// === Bot AI ===
// Bots run server-side on a separate fast tick. Difficulty controls movement
// speed, reaction delay (ms between "saw enemy" and first peck), and how
// tight the aim cone needs to be before swinging.
type BotDifficulty = "easy" | "normal" | "hard";
interface BotTuning {
  moveSpeed: number;          // m/s walking toward target
  reactionMs: number;         // delay after acquiring a new target before pecking
  peckCooldownMul: number;    // multiplier on the base weapon cooldown
  aimSlack: number;           // extra cone tolerance — easier bots swing wildly
  itemSeekRadius: number;     // meters — distance at which bots detour for items
  fleeHpFrac: number;         // HP fraction below which the bot retreats + seeks heals
  jumpChancePerSec: number;   // base probability/sec of a combat hop while in attack range
  targetSwitchSec: number;    // re-evaluate target at least this often (sec) for variety
}
const BOT_TUNING: Record<BotDifficulty, BotTuning> = {
  // Easy bots wander, swing wildly, panic early, rarely jump or grab loot.
  easy:   { moveSpeed: 2.5, reactionMs: 600, peckCooldownMul: 1.6, aimSlack: 0.4,  itemSeekRadius: 5,  fleeHpFrac: 0.45, jumpChancePerSec: 0.4, targetSwitchSec: 6 },
  // Normal bots play the mid-line — sometimes flee, sometimes chase, mostly land hits.
  normal: { moveSpeed: 3.5, reactionMs: 250, peckCooldownMul: 1.0, aimSlack: 0.2,  itemSeekRadius: 8,  fleeHpFrac: 0.3,  jumpChancePerSec: 0.8, targetSwitchSec: 4 },
  // Hard bots ruthlessly grab loot, swap targets frequently, and only flee when nearly dead.
  hard:   { moveSpeed: 4.5, reactionMs: 80,  peckCooldownMul: 0.9, aimSlack: 0.05, itemSeekRadius: 12, fleeHpFrac: 0.2,  jumpChancePerSec: 1.4, targetSwitchSec: 2.5 },
};
// Physics for bot vertical hops — matches the client's feel (a short, snappy flap).
const BOT_JUMP_V = 5.5;
const BOT_GRAVITY = -14;
const BIRD_GROUND_Y = 0.9;
// Items worth detouring for. Heals are special-cased when the bot is low HP.
const HEAL_KINDS = new Set(["heal", "regen", "immortal"]);
const WEAPON_KINDS = new Set(["spear", "slingshot", "lightning"]);
const BOT_NAMES = [
  "Clucky", "Beak Bot", "Drumstick", "Featherweight", "Nugget",
  "Cluck Norris", "Henrietta", "Pecky", "Talon", "Eggbert",
];
const BOT_TICK_MS = 100; // 10Hz AI update — fast enough to feel reactive, cheap on CPU

export class SabongRoom extends Room<SabongState> {
  maxClients = ROYALE_MAX;
  // Auto-start handle — every join while in 'waiting' resets this to give
  // other players time to drop in before the countdown finishes.
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private static START_DELAY_MS = 5000;

  // Bot bookkeeping — keyed by the synthetic bird id we assigned at spawn.
  //   targetPickedAt: when we last (re)chose a target, used to force rotation
  //     so a bot doesn't tunnel-vision on one bird the whole match.
  //   vy: vertical velocity for the bot's jump physics (server-simulated).
  //   nextJumpEligibleAt: gentle anti-spam so they don't pogo every tick.
  private bots = new Map<string, {
    difficulty: BotDifficulty;
    targetId: string | null;
    firstSawTargetAt: number;
    targetPickedAt: number;
    vy: number;
    nextJumpEligibleAt: number;
  }>();
  private botCounter = 0;
  private botTickHandle: ReturnType<typeof setInterval> | null = null;

  onCreate(options?: { bots?: { count?: number; difficulty?: BotDifficulty } }) {
    this.setState(new SabongState());
    this.state.code = this.roomId;

    // Spawn requested bots immediately so the room arrives "populated". maxClients
    // still applies to humans; bots take the remaining slots up to ROYALE_MAX.
    const wantBots = Math.max(0, Math.min(ROYALE_MAX - 1, options?.bots?.count ?? 0));
    const diff: BotDifficulty = (options?.bots?.difficulty as BotDifficulty) ?? "normal";
    for (let i = 0; i < wantBots; i++) this.spawnBot(diff);

    this.botTickHandle = setInterval(() => this.botTick(), BOT_TICK_MS);

    this.onMessage("pose", (client, p: { x: number; y: number; z: number; ry: number }) => {
      const b = this.state.birds.get(client.sessionId);
      if (!b || !b.alive) return;
      const now = Date.now();
      let nx = p.x;
      let nz = p.z;
      const rr = Math.hypot(nx, nz);
      const maxR = ARENA_R - 0.5;
      if (rr > maxR) {
        const k = maxR / rr;
        nx *= k;
        nz *= k;
      }
      if (now >= b.portalCooldownUntil) {
        const entered = PORTAL_POINTS.find((portal) => Math.hypot(nx - portal.x, nz - portal.z) <= PORTAL_RADIUS);
        if (entered) {
          const target = this.chooseRandomPortal(entered);
          nx = target.x;
          nz = target.z;
          b.portalCooldownUntil = now + PORTAL_COOLDOWN_MS;
          this.broadcast('teleport', { id: b.id, x: nx, z: nz });
        }
      }
      b.x = nx;
      b.y = p.y;
      b.z = nz;
      b.ry = p.ry;
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
      // Bots are always ready — they don't have a Client to send "rematch"
      // from, so we auto-mark them so the human(s) don't wait forever.
      this.autoReadyBots();
      // Royale: rematch starts once everyone still in the room has clicked.
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
      for (const b of this.state.birds.values()) {
        if (!b.alive) continue;
        if (b.regenUntil > now) {
          b.hp = Math.min(b.maxHp, b.hp + 3);
        }
      }
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
      for (const b of this.state.birds.values()) {
        if (Math.hypot(b.x - x, b.z - z) < 2) tooClose = true;
      }
      if (!tooClose) break;
    }
    const id = `i${this.dropCounter++}`;
    const drop = new ItemDrop();
    drop.id = id; drop.kind = kind; drop.x = x; drop.z = z;
    this.state.items.set(id, drop);
  }

  private dropCounter = 0;

  private chooseRandomPortal(from: { x: number; z: number }) {
    const others = PORTAL_POINTS.filter((p) => p.x !== from.x || p.z !== from.z)
    const choice = others[Math.floor(Math.random() * others.length)]
    return choice ?? from
  }

  private handleMelee(client: Client) {
    const me = this.state.birds.get(client.sessionId);
    if (me) this.resolveMelee(me, 0);
  }

  // Shared melee resolution — humans hit this via the "peck" message, bots
  // call it directly from their AI tick. `aimSlack` widens the cone for
  // easier-difficulty bots so they don't need perfect facing.
  private resolveMelee(me: Bird, aimSlack: number) {
    if (this.state.phase !== "fighting") return;
    if (!me.alive) return;
    const w = WEAPONS[me.weapon] ?? WEAPONS.beak;
    if (w.ranged) return; // wrong message type for this weapon
    const now = Date.now();
    if (now - me.lastPeckAt < w.cooldownMs) return;
    me.lastPeckAt = now;

    const halfCone = (w.halfCone ?? Math.PI / 3) + aimSlack;
    let hit: Bird | null = null;
    for (const other of this.state.birds.values()) {
      if (other.id === me.id || !other.alive) continue;
      const dx = other.x - me.x;
      const dz = other.z - me.z;
      const dist = Math.hypot(dx, dz);
      if (dist > w.range) continue;
      const angleTo = Math.atan2(-dx, -dz);
      let delta = Math.abs(angleTo - me.ry) % (Math.PI * 2);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      if (delta > halfCone) continue;
      hit = other;
    }

    if (hit) {
      const target = hit as Bird;
      if (target.immortalUntil > now) {
        this.broadcast("peckHit", { from: me.id, to: target.id, hp: target.hp, weapon: me.weapon, blocked: true });
      } else {
        const dmg = w.damage * (me.dmgMulUntil > now ? 2 : 1);
        target.hp = Math.max(0, target.hp - dmg);
        this.broadcast("peckHit", { from: me.id, to: target.id, hp: target.hp, weapon: me.weapon });
        if (target.hp <= 0) { target.alive = false; this.recordElimination(target.id); this.checkWinner(); }
      }
    } else {
      this.broadcast("peckMiss", { from: me.id, weapon: me.weapon });
    }
    this.consumeAmmo(me);
  }

  private handleShoot(client: Client, p: { dx: number; dz: number }) {
    const me = this.state.birds.get(client.sessionId);
    if (me) this.resolveShoot(me, p.dx, p.dz);
  }

  // Shared shoot resolution — humans send "shoot" with aim; bots call this
  // directly with a pre-aimed direction at their target.
  private resolveShoot(me: Bird, dx: number, dz: number) {
    if (this.state.phase !== "fighting") return;
    if (!me.alive) return;
    const w = WEAPONS[me.weapon] ?? WEAPONS.beak;
    if (!w.ranged) return;
    const now = Date.now();
    if (now - me.lastPeckAt < w.cooldownMs) return;
    me.lastPeckAt = now;
    // Normalize aim
    const n = Math.hypot(dx, dz) || 1;
    const ax = dx / n, az = dz / n;

    // Ray from me, find closest opponent hit within range.
    let best: { other: Bird; t: number } | null = null;
    for (const other of this.state.birds.values()) {
      if (other.id === me.id || !other.alive) continue;
      const ox = other.x - me.x;
      const oz = other.z - me.z;
      const t: number = ox * ax + oz * az;
      if (t < 0 || t > w.range) continue;
      const px = ox - t * ax, pz = oz - t * az;
      const perp = Math.hypot(px, pz);
      if (perp > HIT_RADIUS) continue;
      if (!best || t < best.t) best = { other, t };
    }

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
        if (target.hp <= 0) { target.alive = false; this.recordElimination(target.id); this.checkWinner(); }
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
    // Pick the first unused spawn slot so colors stay distinct even if a
    // mid-game leaver freed up slot 3.
    const usedSlots = new Set<number>();
    for (const other of this.state.birds.values()) usedSlots.add(other.spawnIndex);
    let slot = 0;
    while (slot < SPAWNS.length && usedSlots.has(slot)) slot++;
    const spawn = SPAWNS[slot] ?? SPAWNS[0];
    const b = new Bird();
    b.id = client.sessionId;
    b.name = options?.name?.slice(0, 24) || "Rooster";
    b.color = spawn.color;
    b.spawnIndex = slot;
    b.x = spawn.x; b.z = spawn.z; b.ry = spawn.ry;
    this.state.birds.set(client.sessionId, b);

    // Royale start logic: any time we have ≥2 birds in 'waiting', kick off a
    // short countdown. Every new join resets it so a stream of friends can
    // load in without an instant start. Once 'fighting', new joiners drop in
    // alive with full HP — chaotic, but that's the point.
    if (this.state.phase === "waiting" && this.state.birds.size >= 2) {
      if (this.startTimer) clearTimeout(this.startTimer);
      this.startTimer = setTimeout(() => {
        this.startTimer = null;
        if (this.state.birds.size >= 2 && this.state.phase === "waiting") {
          this.state.phase = "fighting";
          // Lock in the player count for placement labels.
          this.state.matchSize = this.state.birds.size;
        }
      }, SabongRoom.START_DELAY_MS);
    }
  }

  // Append a bird id to the elimination order, skipping dupes (defence in
  // depth — a hit that crosses 0 HP twice in the same frame shouldn't push
  // twice).
  private recordElimination(id: string) {
    if (this.state.eliminationOrder.indexOf(id) >= 0) return;
    this.state.eliminationOrder.push(id);
  }

  onLeave(client: Client) {
    const b = this.state.birds.get(client.sessionId);
    if (b) {
      // Closing the tab during a fight counts as an elimination so the
      // placement math stays consistent.
      if (b.alive && this.state.phase === "fighting") this.recordElimination(b.id);
      b.alive = false;
    }
    this.state.birds.delete(client.sessionId);
    // Also drop any pending rematch vote from the leaver.
    const idx = this.state.rematchReady.indexOf(client.sessionId);
    if (idx >= 0) this.state.rematchReady.splice(idx, 1);
    // If they bailed during pre-fight and we no longer have a quorum, cancel
    // the start countdown so we wait for new joiners.
    if (this.state.phase === "waiting" && this.state.birds.size < 2 && this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.state.phase === "fighting") this.checkWinner();
  }

  // === Bots ===

  onDispose() {
    if (this.botTickHandle) { clearInterval(this.botTickHandle); this.botTickHandle = null; }
  }

  private autoReadyBots() {
    for (const botId of this.bots.keys()) {
      if (!this.state.rematchReady.includes(botId)) this.state.rematchReady.push(botId);
    }
  }

  private spawnBot(difficulty: BotDifficulty) {
    const usedSlots = new Set<number>();
    for (const other of this.state.birds.values()) usedSlots.add(other.spawnIndex);
    let slot = 0;
    while (slot < SPAWNS.length && usedSlots.has(slot)) slot++;
    if (slot >= SPAWNS.length) return; // no free spawn rings — arena is full
    const spawn = SPAWNS[slot];
    const id = `bot_${this.botCounter++}`;
    const b = new Bird();
    b.id = id;
    b.name = `🤖 ${BOT_NAMES[slot % BOT_NAMES.length]}`;
    b.color = spawn.color;
    b.spawnIndex = slot;
    b.x = spawn.x; b.z = spawn.z; b.ry = spawn.ry;
    b.isBot = true;
    b.botDifficulty = difficulty;
    this.state.birds.set(id, b);
    this.bots.set(id, {
      difficulty, targetId: null, firstSawTargetAt: 0,
      targetPickedAt: 0, vy: 0, nextJumpEligibleAt: 0,
    });
  }

  // Bot AI — 10Hz tick. Each bot picks a target (with periodic rotation so they
  // don't tunnel-vision on the human), decides between three behaviors based on
  // HP and nearby items, then acts:
  //   FLEE   — HP below the difficulty-tuned threshold: sprint away from threats
  //            and home in on a heal/regen drop if one's in range.
  //   LOOT   — A worthwhile item (heal when wounded, weapon if still on beak) is
  //            within itemSeekRadius and closer than the current target. Detour.
  //   FIGHT  — Default. Walk into attack range, peck/shoot, and occasionally hop
  //            mid-combat so they're not flat-footed targets.
  //
  // Bots also vertical-simulate via `vy` so they can jump on command — the
  // existing Bird.y field is broadcast to all clients automatically.
  private botTick() {
    if (this.state.phase !== "fighting") return;
    const now = Date.now();
    const dt = BOT_TICK_MS / 1000;

    for (const [botId, ctx] of this.bots) {
      const me = this.state.birds.get(botId);
      if (!me || !me.alive) continue;
      const tuning = BOT_TUNING[ctx.difficulty];

      // === 1. Target selection ===
      // Periodically force a re-pick so bots don't all converge on the same
      // bird. Inside the window we keep the current target if it's still alive.
      const currentTarget = ctx.targetId ? this.state.birds.get(ctx.targetId) : undefined;
      const needsNewTarget =
        !currentTarget || !currentTarget.alive ||
        (now - ctx.targetPickedAt) > tuning.targetSwitchSec * 1000;
      let target: Bird | undefined = currentTarget && currentTarget.alive ? currentTarget : undefined;
      if (needsNewTarget) {
        // Pick from all live enemies (humans AND bots — bot-on-bot is fine and
        // keeps matches resolving when humans drop). Closer is more likely but
        // a random weight prevents every bot lining up on the same victim.
        const candidates: Array<{ b: Bird; w: number }> = [];
        for (const other of this.state.birds.values()) {
          if (other.id === me.id || !other.alive) continue;
          const d = Math.hypot(other.x - me.x, other.z - me.z) || 0.1;
          // Inverse-distance weight, plus a flat baseline so far-away bots
          // still occasionally get picked.
          candidates.push({ b: other, w: 1 / d + 0.05 });
        }
        if (candidates.length === 0) continue;
        const total = candidates.reduce((s, c) => s + c.w, 0);
        let r = Math.random() * total;
        target = candidates[0].b;
        for (const c of candidates) { r -= c.w; if (r <= 0) { target = c.b; break; } }
        if (ctx.targetId !== target.id) {
          ctx.targetId = target.id;
          ctx.firstSawTargetAt = now;
        }
        ctx.targetPickedAt = now;
      }
      if (!target) continue;

      const w = WEAPONS[me.weapon] ?? WEAPONS.beak;
      const hpFrac = me.hp / Math.max(1, me.maxHp);
      const lowHp = hpFrac < tuning.fleeHpFrac;

      // === 2. Pick a behavior + a goal position ===
      // Find the most desirable nearby item once, reuse for both LOOT and FLEE.
      let bestItem: { it: ItemDrop; d: number; score: number } | null = null;
      for (const it of this.state.items.values()) {
        const d = Math.hypot(it.x - me.x, it.z - me.z);
        if (d > tuning.itemSeekRadius) continue;
        // Score weighting: heals are king when low HP, weapons matter when on
        // the default beak, every other power-up has a flat baseline.
        let score = 1;
        if (HEAL_KINDS.has(it.kind))    score = lowHp ? 12 : 4;
        if (WEAPON_KINDS.has(it.kind))  score = me.weapon === "beak" ? 6 : 2;
        if (it.kind === "doubleDamage") score = 5;
        if (it.kind === "haste")        score = lowHp ? 6 : 3;
        // Bake distance into the score — closer is much better.
        score /= d + 0.5;
        if (!bestItem || score > bestItem.score) bestItem = { it, d, score };
      }

      let goalX: number, goalZ: number;
      let mode: "fight" | "loot" | "flee";
      if (lowHp) {
        // FLEE — run from target. Vector = (me - target) normalized, projected
        // out to the arena edge. Detour to a heal if one's in pickup range.
        mode = "flee";
        const fdx = me.x - target.x;
        const fdz = me.z - target.z;
        const fn = Math.hypot(fdx, fdz) || 1;
        goalX = me.x + (fdx / fn) * 6;
        goalZ = me.z + (fdz / fn) * 6;
        if (bestItem && HEAL_KINDS.has(bestItem.it.kind)) {
          goalX = bestItem.it.x;
          goalZ = bestItem.it.z;
        }
      } else if (bestItem && bestItem.score > 1.5) {
        // LOOT — the item is genuinely worth a detour.
        mode = "loot";
        goalX = bestItem.it.x;
        goalZ = bestItem.it.z;
      } else {
        // FIGHT — close to attack range on the target.
        mode = "fight";
        goalX = target.x;
        goalZ = target.z;
      }

      // === 3. Move toward goal ===
      const dx = goalX - me.x;
      const dz = goalZ - me.z;
      const dist = Math.hypot(dx, dz) || 1;
      const sprinting = mode === "flee" || (mode === "fight" && dist > (w.range ?? 2) * 2);
      const speedMul =
        (me.hasteUntil > now ? 1.4 : 1) *
        (sprinting ? 1.15 : 1);
      const step = tuning.moveSpeed * speedMul * dt;

      // FIGHT mode stops just inside weapon range; LOOT/FLEE walks all the way.
      const stopDist = mode === "fight" ? (w.range ?? 2) * 0.7 : 0;
      if (dist > stopDist) {
        me.x += (dx / dist) * Math.min(step, dist - stopDist);
        me.z += (dz / dist) * Math.min(step, dist - stopDist);
      }
      // Clamp to arena.
      const rr = Math.hypot(me.x, me.z);
      const maxR = ARENA_R - 0.5;
      if (rr > maxR) { me.x *= maxR / rr; me.z *= maxR / rr; }

      // Face the threat (or the loot direction when running away — looks
      // intentional rather than blind panic).
      const faceX = mode === "flee" ? me.x - target.x : target.x - me.x;
      const faceZ = mode === "flee" ? me.z - target.z : target.z - me.z;
      me.ry = Math.atan2(-faceX, -faceZ);

      // === 4. Vertical sim — gravity + jump impulse ===
      // Combat hops only while in attack range and grounded; flee jumps when a
      // pursuer is close. Cooldown prevents pogo-stick spam.
      const grounded = me.y <= BIRD_GROUND_Y + 0.01;
      if (grounded) me.y = BIRD_GROUND_Y;
      const dToTarget = Math.hypot(target.x - me.x, target.z - me.z);
      const shouldJump =
        grounded &&
        now >= ctx.nextJumpEligibleAt &&
        Math.random() < tuning.jumpChancePerSec * dt &&
        (mode === "fight" ? dToTarget <= (w.range ?? 2) * 1.3 :
         mode === "flee"  ? dToTarget < 4 :
         false);
      if (shouldJump) {
        ctx.vy = BOT_JUMP_V;
        ctx.nextJumpEligibleAt = now + 700;
      }
      if (!grounded || ctx.vy > 0) {
        ctx.vy += BOT_GRAVITY * dt;
        me.y = Math.max(BIRD_GROUND_Y, me.y + ctx.vy * dt);
        if (me.y <= BIRD_GROUND_Y) { me.y = BIRD_GROUND_Y; ctx.vy = 0; }
      }

      // === 5. Auto-pickup any item the bot walked over (matches human path) ===
      for (const [iid, it] of this.state.items) {
        if (Math.hypot(it.x - me.x, it.z - me.z) <= PICKUP_RADIUS) {
          this.applyItem(me, it.kind);
          this.state.items.delete(iid);
          this.broadcast("pickup", { by: me.id, kind: it.kind });
          break;
        }
      }

      // === 6. Attack — only in FIGHT/LOOT modes. FLEE prioritizes survival. ===
      if (mode !== "flee" && dToTarget <= (w.range ?? 2) && now - ctx.firstSawTargetAt >= tuning.reactionMs) {
        const stretchedCooldown = w.cooldownMs * tuning.peckCooldownMul;
        if (now - me.lastPeckAt >= stretchedCooldown) {
          if (w.ranged) {
            const dxAim = target.x - me.x, dzAim = target.z - me.z;
            const n = Math.hypot(dxAim, dzAim) || 1;
            this.resolveShoot(me, dxAim / n, dzAim / n);
          } else {
            this.resolveMelee(me, tuning.aimSlack);
          }
        }
      }
    }
  }

  private resetMatch() {
    this.state.winner = "";
    this.state.phase = "waiting";
    this.state.matchSize = 0;
    while (this.state.rematchReady.length > 0) this.state.rematchReady.pop();
    while (this.state.eliminationOrder.length > 0) this.state.eliminationOrder.pop();
    // Wipe items so the next match starts clean.
    const ids: string[] = [];
    for (const [id] of this.state.items) ids.push(id);
    for (const id of ids) this.state.items.delete(id);
    this.lastDropAt = Date.now(); // first drop ~DROP_INTERVAL_MS into the match
    // Clear bot AI state — last round's target/timing shouldn't bleed into this one.
    for (const ctx of this.bots.values()) {
      ctx.targetId = null; ctx.firstSawTargetAt = 0;
      ctx.targetPickedAt = 0; ctx.vy = 0; ctx.nextJumpEligibleAt = 0;
    }
    for (const b of this.state.birds.values()) {
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
    }
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = setTimeout(() => {
      this.startTimer = null;
      if (this.state.birds.size >= 2 && this.state.phase === "waiting") {
        this.state.phase = "fighting";
        this.state.matchSize = this.state.birds.size;
      }
    }, SabongRoom.START_DELAY_MS);
  }

  private checkWinner() {
    const survivors: Bird[] = [];
    for (const b of this.state.birds.values()) {
      if (b.alive) survivors.push(b);
    }
    if (survivors.length <= 1) {
      this.state.phase = "over";
      this.state.winner = survivors[0]?.id ?? "";
    }
  }
}
