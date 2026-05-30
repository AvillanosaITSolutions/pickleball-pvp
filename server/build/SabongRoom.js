"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SabongRoom = exports.SabongState = exports.ItemDrop = exports.Bird = void 0;
const core_1 = require("@colyseus/core");
const schema_1 = require("@colyseus/schema");
class Bird extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.name = "";
        this.color = "#dc2626"; // red or blue
        this.x = 0;
        this.y = 0.9;
        this.z = 0;
        this.ry = 0;
        this.hp = 100;
        this.maxHp = 100;
        this.alive = true;
        this.lastPeckAt = 0;
        this.spawnIndex = 0; // remembered across rematches
        // Loadout & buffs (Date.now() ms timestamps)
        this.weapon = "beak";
        this.weaponAmmo = -1; // -1 = unlimited
        this.dmgMulUntil = 0;
        this.hasteUntil = 0;
        this.regenUntil = 0;
        this.immortalUntil = 0;
        this.portalCooldownUntil = 0;
    }
}
exports.Bird = Bird;
__decorate([
    (0, schema_1.type)("string")
], Bird.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("string")
], Bird.prototype, "name", void 0);
__decorate([
    (0, schema_1.type)("string")
], Bird.prototype, "color", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "z", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "ry", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "hp", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "maxHp", void 0);
__decorate([
    (0, schema_1.type)("boolean")
], Bird.prototype, "alive", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "lastPeckAt", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "spawnIndex", void 0);
__decorate([
    (0, schema_1.type)("string")
], Bird.prototype, "weapon", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "weaponAmmo", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "dmgMulUntil", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "hasteUntil", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "regenUntil", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "immortalUntil", void 0);
__decorate([
    (0, schema_1.type)("number")
], Bird.prototype, "portalCooldownUntil", void 0);
class ItemDrop extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.kind = "";
        this.x = 0;
        this.z = 0;
    }
}
exports.ItemDrop = ItemDrop;
__decorate([
    (0, schema_1.type)("string")
], ItemDrop.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("string")
], ItemDrop.prototype, "kind", void 0);
__decorate([
    (0, schema_1.type)("number")
], ItemDrop.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number")
], ItemDrop.prototype, "z", void 0);
class SabongState extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.code = "";
        this.phase = "waiting";
        this.winner = "";
        this.birds = new schema_1.MapSchema();
        this.items = new schema_1.MapSchema();
        this.rematchReady = new schema_1.ArraySchema();
    }
}
exports.SabongState = SabongState;
__decorate([
    (0, schema_1.type)("string")
], SabongState.prototype, "code", void 0);
__decorate([
    (0, schema_1.type)("string")
], SabongState.prototype, "phase", void 0);
__decorate([
    (0, schema_1.type)("string")
], SabongState.prototype, "winner", void 0);
__decorate([
    (0, schema_1.type)({ map: Bird })
], SabongState.prototype, "birds", void 0);
__decorate([
    (0, schema_1.type)({ map: ItemDrop })
], SabongState.prototype, "items", void 0);
__decorate([
    (0, schema_1.type)(["string"])
], SabongState.prototype, "rematchReady", void 0);
// Yaw convention matches the client: ry such that a group with rotation.y = ry
// has its forward axis (-Z in local space) aligned with the desired world
// direction. yaw = atan2(-forwardX, -forwardZ).
//   Player1 at (-3,0,0), forward +X  → ry = atan2(-1, 0) = -π/2
//   Player2 at (+3,0,0), forward -X  → ry = atan2( 1, 0) =  π/2
const SPAWNS = [
    { x: -8, z: 0, ry: -Math.PI / 2, color: "#dc2626" },
    { x: 8, z: 0, ry: Math.PI / 2, color: "#2563eb" },
];
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
const WEAPONS = {
    beak: { ranged: false, damage: 15, range: 2.0, halfCone: Math.PI / 2.5, ammo: -1, cooldownMs: 450 },
    spear: { ranged: false, damage: 28, range: 2.9, halfCone: Math.PI / 3, ammo: 8, cooldownMs: 600 },
    slingshot: { ranged: true, damage: 14, range: 14, ammo: 6, cooldownMs: 350 },
    lightning: { ranged: true, damage: 35, range: 18, ammo: 2, cooldownMs: 900 },
};
// Drop table — weighted; "kind" maps to either a weapon name (above) or a power-up.
const DROP_TABLE = [
    { kind: "spear", weight: 18 },
    { kind: "slingshot", weight: 16 },
    { kind: "lightning", weight: 6 },
    { kind: "doubleDamage", weight: 14 },
    { kind: "haste", weight: 14 },
    { kind: "regen", weight: 10 },
    { kind: "heal", weight: 14 },
    { kind: "immortal", weight: 5 },
];
const EFFECT_DUR_MS = {
    doubleDamage: 15000,
    haste: 15000,
    regen: 20000,
    immortal: 10000,
};
const DROP_INTERVAL_MS = 8000;
const MAX_ACTIVE_ITEMS = 5;
const PICKUP_RADIUS = 1.6;
const HIT_RADIUS = 0.6; // ranged ray vs bird capsule (approx as a 0.6m radius column)
class SabongRoom extends core_1.Room {
    constructor() {
        super(...arguments);
        this.maxClients = 2;
        this.lastDropAt = 0;
        this.dropCounter = 0;
    }
    onCreate() {
        this.setState(new SabongState());
        this.state.code = this.roomId;
        this.onMessage("pose", (client, p) => {
            const b = this.state.birds.get(client.sessionId);
            if (!b || !b.alive)
                return;
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
        this.onMessage("shoot", (client, p) => {
            this.handleShoot(client, p);
        });
        this.onMessage("pickup", (client, p) => {
            this.handlePickup(client, p?.id);
        });
        this.onMessage("rematch", (client) => {
            if (this.state.phase !== "over")
                return;
            if (this.state.rematchReady.includes(client.sessionId))
                return;
            this.state.rematchReady.push(client.sessionId);
            if (this.state.rematchReady.length >= this.state.birds.size && this.state.birds.size >= 2) {
                this.resetMatch();
            }
        });
        // Sim tick: regen + item drops. 1Hz is plenty.
        this.setSimulationInterval(() => this.tick(), 1000);
    }
    tick() {
        const now = Date.now();
        // Regen (only while fighting)
        if (this.state.phase === "fighting") {
            for (const b of this.state.birds.values()) {
                if (!b.alive)
                    continue;
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
    spawnDrop() {
        const total = DROP_TABLE.reduce((s, e) => s + e.weight, 0);
        let r = Math.random() * total;
        let kind = DROP_TABLE[0].kind;
        for (const e of DROP_TABLE) {
            r -= e.weight;
            if (r <= 0) {
                kind = e.kind;
                break;
            }
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
                if (Math.hypot(b.x - x, b.z - z) < 2)
                    tooClose = true;
            }
            if (!tooClose)
                break;
        }
        const id = `i${this.dropCounter++}`;
        const drop = new ItemDrop();
        drop.id = id;
        drop.kind = kind;
        drop.x = x;
        drop.z = z;
        this.state.items.set(id, drop);
    }
    chooseRandomPortal(from) {
        const others = PORTAL_POINTS.filter((p) => p.x !== from.x || p.z !== from.z);
        const choice = others[Math.floor(Math.random() * others.length)];
        return choice ?? from;
    }
    handleMelee(client) {
        if (this.state.phase !== "fighting")
            return;
        const me = this.state.birds.get(client.sessionId);
        if (!me || !me.alive)
            return;
        const w = WEAPONS[me.weapon] ?? WEAPONS.beak;
        if (w.ranged)
            return; // wrong message type for this weapon
        const now = Date.now();
        if (now - me.lastPeckAt < w.cooldownMs)
            return;
        me.lastPeckAt = now;
        const halfCone = w.halfCone ?? Math.PI / 3;
        let hit = null;
        for (const other of this.state.birds.values()) {
            if (other.id === me.id || !other.alive)
                continue;
            const dx = other.x - me.x;
            const dz = other.z - me.z;
            const dist = Math.hypot(dx, dz);
            if (dist > w.range)
                continue;
            const angleTo = Math.atan2(-dx, -dz);
            let delta = Math.abs(angleTo - me.ry) % (Math.PI * 2);
            if (delta > Math.PI)
                delta = Math.PI * 2 - delta;
            if (delta > halfCone)
                continue;
            hit = other;
        }
        if (hit) {
            const target = hit;
            if (target.immortalUntil > now) {
                // Hit registered but no damage — still tell clients so the impact effect plays.
                this.broadcast("peckHit", { from: me.id, to: target.id, hp: target.hp, weapon: me.weapon, blocked: true });
            }
            else {
                const dmg = w.damage * (me.dmgMulUntil > now ? 2 : 1);
                target.hp = Math.max(0, target.hp - dmg);
                this.broadcast("peckHit", { from: me.id, to: target.id, hp: target.hp, weapon: me.weapon });
                if (target.hp <= 0) {
                    target.alive = false;
                    this.checkWinner();
                }
            }
        }
        else {
            this.broadcast("peckMiss", { from: me.id, weapon: me.weapon });
        }
        this.consumeAmmo(me);
    }
    handleShoot(client, p) {
        if (this.state.phase !== "fighting")
            return;
        const me = this.state.birds.get(client.sessionId);
        if (!me || !me.alive)
            return;
        const w = WEAPONS[me.weapon] ?? WEAPONS.beak;
        if (!w.ranged)
            return;
        const now = Date.now();
        if (now - me.lastPeckAt < w.cooldownMs)
            return;
        me.lastPeckAt = now;
        // Normalize aim
        const n = Math.hypot(p.dx, p.dz) || 1;
        const ax = p.dx / n, az = p.dz / n;
        // Ray from me, find closest opponent hit within range.
        let best = null;
        for (const other of this.state.birds.values()) {
            if (other.id === me.id || !other.alive)
                continue;
            const ox = other.x - me.x;
            const oz = other.z - me.z;
            const t = ox * ax + oz * az;
            if (t < 0 || t > w.range)
                continue;
            const px = ox - t * ax, pz = oz - t * az;
            const perp = Math.hypot(px, pz);
            if (perp > HIT_RADIUS)
                continue;
            if (!best || t < best.t)
                best = { other, t };
        }
        const endT = best ? best.t : w.range;
        const ex = me.x + ax * endT;
        const ez = me.z + az * endT;
        if (best) {
            const target = best.other;
            if (target.immortalUntil > now) {
                this.broadcast("shotHit", { from: me.id, to: target.id, hp: target.hp, weapon: me.weapon, ex, ez, blocked: true });
            }
            else {
                const dmg = w.damage * (me.dmgMulUntil > now ? 2 : 1);
                target.hp = Math.max(0, target.hp - dmg);
                this.broadcast("shotHit", { from: me.id, to: target.id, hp: target.hp, weapon: me.weapon, ex, ez });
                if (target.hp <= 0) {
                    target.alive = false;
                    this.checkWinner();
                }
            }
        }
        else {
            this.broadcast("shotMiss", { from: me.id, weapon: me.weapon, ex, ez });
        }
        this.consumeAmmo(me);
    }
    consumeAmmo(me) {
        const w = WEAPONS[me.weapon] ?? WEAPONS.beak;
        if (w.ammo < 0)
            return;
        me.weaponAmmo -= 1;
        if (me.weaponAmmo <= 0) {
            me.weapon = "beak";
            me.weaponAmmo = -1;
        }
    }
    handlePickup(client, itemId) {
        if (this.state.phase !== "fighting")
            return;
        const me = this.state.birds.get(client.sessionId);
        if (!me || !me.alive)
            return;
        const item = this.state.items.get(itemId);
        if (!item)
            return;
        if (Math.hypot(item.x - me.x, item.z - me.z) > PICKUP_RADIUS)
            return;
        this.applyItem(me, item.kind);
        this.state.items.delete(itemId);
        this.broadcast("pickup", { by: me.id, kind: item.kind });
    }
    applyItem(me, kind) {
        const now = Date.now();
        if (WEAPONS[kind]) {
            me.weapon = kind;
            me.weaponAmmo = WEAPONS[kind].ammo;
            return;
        }
        switch (kind) {
            case "doubleDamage":
                me.dmgMulUntil = Math.max(me.dmgMulUntil, now + EFFECT_DUR_MS.doubleDamage);
                break;
            case "haste":
                me.hasteUntil = Math.max(me.hasteUntil, now + EFFECT_DUR_MS.haste);
                break;
            case "regen":
                me.regenUntil = Math.max(me.regenUntil, now + EFFECT_DUR_MS.regen);
                break;
            case "immortal":
                me.immortalUntil = Math.max(me.immortalUntil, now + EFFECT_DUR_MS.immortal);
                break;
            case "heal":
                me.hp = Math.min(me.maxHp, me.hp + 40);
                break;
        }
    }
    onJoin(client, options) {
        const slot = this.state.birds.size;
        const spawn = SPAWNS[slot] ?? SPAWNS[0];
        const b = new Bird();
        b.id = client.sessionId;
        b.name = options?.name?.slice(0, 24) || "Rooster";
        b.color = spawn.color;
        b.spawnIndex = slot;
        b.x = spawn.x;
        b.z = spawn.z;
        b.ry = spawn.ry;
        this.state.birds.set(client.sessionId, b);
        if (this.state.birds.size === 2 && this.state.phase === "waiting") {
            // Brief countdown handled client-side; we just flip phase.
            setTimeout(() => {
                if (this.state.birds.size === 2)
                    this.state.phase = "fighting";
            }, 2500);
        }
    }
    onLeave(client) {
        const b = this.state.birds.get(client.sessionId);
        if (b)
            b.alive = false;
        this.state.birds.delete(client.sessionId);
        if (this.state.phase === "fighting")
            this.checkWinner();
    }
    resetMatch() {
        this.state.winner = "";
        this.state.phase = "waiting";
        while (this.state.rematchReady.length > 0)
            this.state.rematchReady.pop();
        // Wipe items so the next match starts clean.
        const ids = [];
        for (const [id] of this.state.items)
            ids.push(id);
        for (const id of ids)
            this.state.items.delete(id);
        this.lastDropAt = Date.now(); // first drop ~DROP_INTERVAL_MS into the match
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
        setTimeout(() => {
            if (this.state.birds.size >= 2 && this.state.phase === "waiting") {
                this.state.phase = "fighting";
            }
        }, 2500);
    }
    checkWinner() {
        const survivors = [];
        for (const b of this.state.birds.values()) {
            if (b.alive)
                survivors.push(b);
        }
        if (survivors.length <= 1) {
            this.state.phase = "over";
            this.state.winner = survivors[0]?.id ?? "";
        }
    }
}
exports.SabongRoom = SabongRoom;
